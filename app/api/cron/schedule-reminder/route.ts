import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'
import { emailTransport } from '@/lib/email/client'
import { logSystem } from '@/lib/log'
import { NATE_SMS } from '@/lib/constants/sms'

const SCHEDULE_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/schedule`
  : 'https://yourboats.vercel.app/schedule'

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Check for unapproved scheduled services this week (Monday–Sunday UTC)
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS unapproved_count
    FROM services
    WHERE service_date >= DATE_TRUNC('week', CURRENT_DATE)
      AND service_date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
      AND status = 'scheduled'
      AND approved_at IS NULL
  `)
  const rows = result as unknown as { unapproved_count: number }[]
  const unapprovedCount = rows[0]?.unapproved_count ?? 0

  if (unapprovedCount === 0) {
    await logSystem({ action: 'cron_schedule_reminder', metadata: { sent: false, reason: 'week_approved' } })
    return NextResponse.json({ sent: false, reason: 'week_approved' })
  }

  try {
    await emailTransport.sendMail({
      from: `"yourboats" <${process.env.GMAIL_USER}>`,
      to: NATE_SMS,
      subject: 'Schedule approval reminder',
      text: `Reminder: Please approve this weeks schedule. (${SCHEDULE_URL})`,
    })
    await logSystem({ action: 'cron_schedule_reminder', metadata: { sent: true } })
    return NextResponse.json({ sent: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logSystem({ action: 'cron_schedule_reminder', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
