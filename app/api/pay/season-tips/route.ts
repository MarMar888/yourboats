import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getSeasonTips, type SeasonTipJob } from '@/lib/pay/season-tips'

export type { SeasonTipJob }

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const requestedUserId = searchParams.get('userId')
  const isDate = (value: string | null): value is string => {
    if (value == null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }

  if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const canPreviewEmployee = user.role === 'owner' || user.role === 'manager'
  if (requestedUserId && !canPreviewEmployee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const targetUserId = requestedUserId || user.id
  const result = await getSeasonTips({ userId: targetUserId, startDate, endDate })
  return NextResponse.json(result)
}
