import { NextResponse } from 'next/server'
import { syncQboItems } from '@/lib/qbo/items'

export async function POST() {
  const result = await syncQboItems()
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json(result)
}
