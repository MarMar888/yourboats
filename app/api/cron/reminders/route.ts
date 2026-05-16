import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'
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
  customer_name: string
  customer_email: string
  customer_phone: string | null
  boat_label: string | null
}

// Grouped per-customer data
interface CustomerReminder {
  email: string
  name: string
  phone: string | null
  serviceDate: string
  serviceType: string
  boats: string[]
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

  // ── Guard: require email credentials ──────────────────────────────────────
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[cron/reminders] GMAIL_USER or GMAIL_APP_PASSWORD not set — aborting')
    return NextResponse.json(
      { error: 'Email credentials not configured' },
      { status: 500 }
    )
  }

  // ── Query tomorrow's scheduled services ───────────────────────────────────
  let rows: TomorrowServiceRow[]
  try {
    const result = await db.execute(sql`
      SELECT
        s.id              AS service_id,
        s.service_date    AS service_date,
        s.service_type    AS service_type,
        c.name            AS customer_name,
        c.email           AS customer_email,
        c.phone           AS customer_phone,
        COALESCE(b.nickname, b.make_model, 'Unnamed Boat') AS boat_label
      FROM services s
      JOIN customers c ON s.customer_id = c.id
      LEFT JOIN service_boats sb ON sb.service_id = s.id
      LEFT JOIN boats b ON b.id = sb.boat_id
      WHERE s.service_date = (CURRENT_DATE + INTERVAL '1 day')::date
        AND s.status = 'scheduled'
        AND c.email IS NOT NULL
        AND c.email != ''
    `)
    rows = result as unknown as TomorrowServiceRow[]
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/reminders] DB query failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (rows.length === 0) {
    console.log('[cron/reminders] No scheduled services tomorrow — nothing to send')
    return NextResponse.json({ sent: 0, skipped: 0, errors: [] })
  }

  // ── Group by customer email ────────────────────────────────────────────────
  const byCustomer = new Map<string, CustomerReminder>()

  for (const row of rows) {
    const existing = byCustomer.get(row.customer_email)
    if (existing) {
      if (row.boat_label && !existing.boats.includes(row.boat_label)) {
        existing.boats.push(row.boat_label)
      }
    } else {
      byCustomer.set(row.customer_email, {
        email: row.customer_email,
        name: row.customer_name,
        phone: row.customer_phone ?? null,
        serviceDate: formatDate(row.service_date),
        serviceType: formatServiceType(row.service_type),
        boats: row.boat_label ? [row.boat_label] : [],
      })
    }
  }

  // ── Send one email per customer ────────────────────────────────────────────
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const reminder of Array.from(byCustomer.values())) {
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
        to: reminder.email,
        subject,
        text,
        html,
      })
      console.log(`[cron/reminders] Sent reminder to ${reminder.email}`)
      sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[cron/reminders] Failed to send to ${reminder.email}:`, message)
      errors.push(`${reminder.email}: ${message}`)
      skipped++
    }
  }

  console.log(`[cron/reminders] Done — sent: ${sent}, skipped: ${skipped}, errors: ${errors.length}`)
  return NextResponse.json({ sent, skipped, errors })
}

/**
 * Convert a YYYY-MM-DD date string to a friendly display like "Tuesday, June 3".
 */
function formatDate(dateStr: string): string {
  // Parse as UTC to avoid timezone shifting the date
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
