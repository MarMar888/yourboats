import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customers, services, customerReminderContacts } from '@/lib/db/schema'
import { eq, and, gte, lte, inArray } from 'drizzle-orm'

// ─── Config ───────────────────────────────────────────────────────────────────

const CRON_SECRET = process.env.CRON_SECRET
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.REMINDER_FROM_EMAIL ?? 'reminders@yourboats.app'

// Days ahead to remind (services scheduled N days from today get a reminder)
const REMIND_DAYS_AHEAD = 2

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatServiceType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Email sender (Resend via fetch) ──────────────────────────────────────────

async function sendReminderEmail(to: string, customerName: string, serviceDate: string, serviceType: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[reminders] RESEND_API_KEY not set — skipping actual send')
    return { ok: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject: `Reminder: Boat service on ${formatDate(serviceDate)}`,
      text: [
        `Hi ${customerName},`,
        '',
        `This is a reminder that your ${formatServiceType(serviceType)} service is scheduled for ${formatDate(serviceDate)}.`,
        '',
        'If you have any questions, please don\'t hesitate to reach out.',
        '',
        'Thanks,',
        'Your Boats Team',
      ].join('\n'),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return { ok: false, error: `Resend API error ${res.status}: ${body}` }
  }

  return { ok: true }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth: require CRON_SECRET header if set
  if (CRON_SECRET) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const isDryRun = req.nextUrl.searchParams.get('dry') === '1'

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const targetDate = addDays(today, REMIND_DAYS_AHEAD)
  const targetDateStr = toDateString(targetDate)

  // Fetch scheduled services on the target date
  const upcomingServices = await db
    .select({
      serviceId:   services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      customerId:  services.customerId,
    })
    .from(services)
    .where(
      and(
        eq(services.status, 'scheduled'),
        gte(services.serviceDate, targetDateStr),
        lte(services.serviceDate, targetDateStr),
      )
    )

  if (upcomingServices.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: 0,
      message: `No scheduled services found for ${targetDateStr}`,
    })
  }

  // Fetch customer details for those services
  const customerIds = Array.from(new Set(upcomingServices.map((s) => s.customerId)))

  const customerRows = await db
    .select()
    .from(customers)
    .where(inArray(customers.id, customerIds))

  const customerMap = new Map(customerRows.map((c) => [c.id, c]))

  // Fetch all reminder contacts for those customers
  const reminderContactRows = await db
    .select()
    .from(customerReminderContacts)
    .where(inArray(customerReminderContacts.customerId, customerIds))

  // Group reminder contacts by customerId
  const reminderContactsByCustomer = new Map<string, string[]>()
  for (const rc of reminderContactRows) {
    const existing = reminderContactsByCustomer.get(rc.customerId) ?? []
    existing.push(rc.email)
    reminderContactsByCustomer.set(rc.customerId, existing)
  }

  // Process each service
  const results: Array<{
    serviceId: string
    serviceDate: string
    serviceType: string
    customerName: string
    recipients: string[]
    sent: number
    errors: string[]
  }> = []

  for (const svc of upcomingServices) {
    const customer = customerMap.get(svc.customerId)
    if (!customer) continue

    // Collect all recipient emails: primary + reminder contacts
    const allRecipients: string[] = []
    if (customer.email) allRecipients.push(customer.email)
    const extraEmails = reminderContactsByCustomer.get(svc.customerId) ?? []
    allRecipients.push(...extraEmails)

    if (allRecipients.length === 0) {
      results.push({
        serviceId:    svc.serviceId,
        serviceDate:  svc.serviceDate,
        serviceType:  svc.serviceType,
        customerName: customer.name,
        recipients:   [],
        sent:         0,
        errors:       ['no email addresses configured'],
      })
      continue
    }

    const errors: string[] = []
    let sent = 0

    if (!isDryRun) {
      for (const email of allRecipients) {
        const result = await sendReminderEmail(email, customer.name, svc.serviceDate, svc.serviceType)
        if (result.ok) {
          sent++
        } else {
          errors.push(`${email}: ${result.error}`)
        }
      }
    } else {
      sent = allRecipients.length
    }

    results.push({
      serviceId:    svc.serviceId,
      serviceDate:  svc.serviceDate,
      serviceType:  svc.serviceType,
      customerName: customer.name,
      recipients:   allRecipients,
      sent:         isDryRun ? 0 : sent,
      errors,
    })
  }

  const totalSent    = results.reduce((acc, r) => acc + r.sent, 0)
  const totalSkipped = results.filter((r) => r.recipients.length === 0).length

  return NextResponse.json({
    dryRun:      isDryRun,
    targetDate:  targetDateStr,
    services:    results,
    totalSent,
    totalSkipped,
    message: isDryRun
      ? `Dry run — would send to ${results.reduce((acc, r) => acc + r.recipients.length, 0)} recipient(s) across ${results.length} service(s)`
      : `Sent ${totalSent} reminder(s) across ${results.length} service(s)`,
  })
}
