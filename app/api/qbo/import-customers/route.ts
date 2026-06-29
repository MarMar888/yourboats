import { NextResponse } from 'next/server'
import { importAllCustomersFromQbo } from '@/lib/qbo/customers'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function POST() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await importAllCustomersFromQbo()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
