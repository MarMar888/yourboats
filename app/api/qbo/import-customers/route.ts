import { NextResponse } from 'next/server'
import { importAllCustomersFromQbo } from '@/lib/qbo/customers'

export async function POST() {
  try {
    const result = await importAllCustomersFromQbo()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
