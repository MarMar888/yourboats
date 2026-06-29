import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'
import { emailTransport } from '@/lib/email/client'
import { logSystem } from '@/lib/log'
import { NATE_SMS } from '@/lib/constants/sms'
import { todayETDate } from '@/lib/date'

const SCHEDULE_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/schedule`
  : 'https://yourboats.vercel.app/schedule'

export async function GET(req: NextRequest) {
  // Fail closed: without a configured secret this endpoint must never run.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/schedule-reminder] CRON_SECRET not set — refusing to run')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekStart = getWeekStart(todayETDate())
  const nextWeekStart = addDays(weekStart, 7)
  const weekStartStr = toISODate(weekStart)
  const nextWeekStartStr = toISODate(nextWeekStart)

  // Check for unapproved scheduled services in the same Sunday-Saturday week as the schedule page.
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS unapproved_count
    FROM services
    WHERE service_date >= ${weekStartStr}::date
      AND service_date < ${nextWeekStartStr}::date
      AND status = 'scheduled'
      AND approved_at IS NULL
  `)
  const rows = result as unknown as { unapproved_count: number }[]
  const unapprovedCount = rows[0]?.unapproved_count ?? 0

  if (unapprovedCount === 0) {
    await logSystem({
      action: 'cron_schedule_reminder',
      metadata: { sent: false, reason: 'week_approved', weekStart: weekStartStr, weekEndExclusive: nextWeekStartStr },
    })
    return NextResponse.json({ sent: false, reason: 'week_approved' })
  }

  try {
    await emailTransport.sendMail({
      from: `"yourboats" <${process.env.GMAIL_USER}>`,
      to: NATE_SMS,
      subject: 'Schedule approval reminder',
      text: `Reminder: Please approve this weeks schedule. (${SCHEDULE_URL})`,
    })
    await logSystem({
      action: 'cron_schedule_reminder',
      metadata: { sent: true, weekStart: weekStartStr, weekEndExclusive: nextWeekStartStr },
    })
    return NextResponse.json({ sent: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logSystem({ action: 'cron_schedule_reminder', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
