import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { calculateEmployeePay } from '@/lib/pay/calculate'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  if (!userId || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const result = await calculateEmployeePay({ userId, startDate, endDate })
  return NextResponse.json(result)
}
