import { NextResponse } from 'next/server'
import { syncQboItems } from '@/lib/qbo/items'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function POST() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncQboItems()
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json(result)
}
