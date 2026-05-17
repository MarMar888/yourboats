import { NextRequest, NextResponse } from 'next/server'
import { sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/drizzle'
import { services, customerReminderContacts } from '@/lib/db/schema'
import { emailTransport } from '@/lib/email/client'
import {
  serviceReminderEmail,
  formatServiceType,
} from '@/lib/email/templates/service-reminder'

// Row returned by the tomorrow-services query
interface TomorrowServiceRow {
  service_id: string
  service_date: string
  service_type: string
  customer_id: string
  customer_name: string
  customer_phone: string | null
  boat_label: string | null
}

// Grouped per-customer data
interface CustomerReminder {
  customerId: string
  name: string
  phone: string | null
  serviceDate: string
  serviceType: string
  boats: string[]
  serviceIds: string[]
}

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dryRun') === 'true'

  // ?date=YYYY-MM-DD overrides "tomorrow" — useful for testing
  const dateOverride = searchParams.get('date')
  const targetDate = dateOverride
    ? sql`${dateOverride}::date`
    : sql`(CURRENT_DATE + INTERVAL '1 day')::date`

  // ── Guard: require email credentials (skip in dry-run mode) ───────────────
  if (!dryRun && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)) {
    console.warn('[cron/reminders] GMAIL_USER or GMAIL_APP_PASSWORD not set — aborting')
    return NextResponse.json(
      { error: 'Email credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local' },
      { status: 500 }
    )
  }

  // ── Query target date's scheduled services ────────────────────────────────
  let rows: TomorrowServiceRow[]
  try {
    const result = await db.execute(sql`
      SELECT
        s.id              AS service_id,
        s.service_date    AS service_date,
        s.service_type    AS service_type,
        c.id              AS customer_id,
        c.name            AS customer_name,
        c.phone           AS customer_phone,
        COALESCE(b.nickname, b.make_model, 'Unnamed Boat') AS boat_label
      FROM services s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN service_boats sb ON sb.service_id = s.id
      LEFT JOIN boats b ON b.id = sb.boat_id
      WHERE s.service_date = ${targetDate}
        AND s.status = 'scheduled'
        AND s.approved_at IS NOT NULL
    `)
    rows = result as unknown as TomorrowServiceRow[]
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/reminders] DB query failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (rows.length === 0) {
    const label = dateOverride ?? 'tomorrow'
    console.log(`[cron/reminders] No approved scheduled services on ${label} — nothing to send`)
    return NextResponse.json({ sent: 0, skipped: 0, errors: [], dryRun, targetDate: dateOverride ?? null, preview: [] })
  }

  // ── Group by customer id ──────────────────────────────────────────────────
  const byCustomer = new Map<string, CustomerReminder>()

  for (const row of rows) {
    const existing = byCustomer.get(row.customer_id)
    if (existing) {
      if (row.boat_label && !existing.boats.includes(row.boat_label)) {
        existing.boats.push(row.boat_label)
      }
      if (!existing.serviceIds.includes(row.service_id)) {
        existing.serviceIds.push(row.service_id)
      }
    } else {
      byCustomer.set(row.customer_id, {
        customerId: row.customer_id,
        name: row.customer_name,
        phone: row.customer_phone ?? null,
        serviceDate: formatDate(row.service_date),
        serviceType: formatServiceType(row.service_type),
        boats: row.boat_label ? [row.boat_label] : [],
        serviceIds: [row.service_id],
      })
    }
  }

  // ── Fetch extra reminder contacts ──────────────────────────────────────────
  const customerIds = Array.from(byCustomer.values()).map((r) => r.customerId)
  const extraContacts = customerIds.length
    ? await db
        .select({ customerId: customerReminderContacts.customerId, email: customerReminderContacts.email })
        .from(customerReminderContacts)
        .where(inArray(customerReminderContacts.customerId, customerIds))
    : []

  const extraByCustomer = new Map<string, string[]>()
  for (const c of extraContacts) {
    const list = extraByCustomer.get(c.customerId) ?? []
    list.push(c.email)
    extraByCustomer.set(c.customerId, list)
  }

  // ── Dry-run: return preview without sending ───────────────────────────────
  if (dryRun) {
    const preview = Array.from(byCustomer.values()).map((r) => {
      const contacts = extraByCustomer.get(r.customerId) ?? []
      return {
        to: contacts.join(', ') || '(no reminder contacts)',
        customer: r.name,
        serviceDate: r.serviceDate,
        boats: r.boats,
        serviceIds: r.serviceIds,
      }
    })
    return NextResponse.json({ sent: 0, skipped: 0, errors: [], dryRun: true, targetDate: dateOverride ?? null, preview })
  }

  // ── Send emails via Gmail ──────────────────────────────────────────────────
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const reminder of Array.from(byCustomer.values())) {
    const contacts = extraByCustomer.get(reminder.customerId) ?? []

    if (contacts.length === 0) {
      console.log(`[cron/reminders] No reminder contacts for ${reminder.name} — skipping`)
      skipped++
      continue
    }

    const { subject, text, html } = serviceReminderEmail({
      customerName: reminder.name,
      serviceDate: reminder.serviceDate,
      boats: reminder.boats,
      serviceType: reminder.serviceType,
      businessPhone: reminder.phone ?? undefined,
    })

    try {
      await emailTransport.sendMail({
        from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
        to: contacts.join(', '),
        subject,
        text,
        html,
      })
      await db
        .update(services)
        .set({ reminderSentAt: new Date() })
        .where(inArray(services.id, reminder.serviceIds))
      console.log(`[cron/reminders] Sent reminder to ${contacts.join(', ')}`)
      sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[cron/reminders] Failed to send to ${contacts.join(', ')}:`, message)
      errors.push(`${reminder.name}: ${message}`)
      skipped++
    }
  }

  console.log(`[cron/reminders] Done — sent: ${sent}, skipped: ${skipped}, errors: ${errors.length}`)
  return NextResponse.json({ sent, skipped, errors, dryRun: false, targetDate: dateOverride ?? null })
}

/**
 * Convert a YYYY-MM-DD date string to a friendly display like "Tuesday, June 3".
 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
