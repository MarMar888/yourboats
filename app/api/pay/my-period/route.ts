import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { payroll, serviceBoats, boats } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export type MyServiceRow = {
  serviceId: string
  serviceDate: string
  serviceType: string
  customerName: string
  boats: string[]
  totalPrice: number
  splitPct: number
  netPay: number
  approved: boolean
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Pull saved payroll rows for this user in the period
  const rows = await db
    .select({
      serviceId:    payroll.serviceId,
      serviceDate:  payroll.serviceDate,
      serviceType:  payroll.serviceType,
      customerName: payroll.customerName,
      totalPrice:   payroll.totalPrice,
      splitPct:     payroll.splitPct,
      netPay:       payroll.netPay,
      approvedAt:   payroll.approvedAt,
    })
    .from(payroll)
    .where(
      and(
        sql`${payroll.userId} = ${user.id}::text`,
        gte(payroll.serviceDate, startDate),
        lte(payroll.serviceDate, endDate)
      )
    )
    .orderBy(payroll.serviceDate)

  if (rows.length === 0) {
    return NextResponse.json({ services: [] })
  }

  // Fetch boat names for each service
  const serviceIds = rows.map((r) => r.serviceId)
  const boatRows = await db
    .select({ serviceId: serviceBoats.serviceId, nickname: boats.nickname })
    .from(serviceBoats)
    .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
    .where(inArray(serviceBoats.serviceId, serviceIds))

  const boatsByService: Record<string, string[]> = {}
  for (const b of boatRows) {
    ;(boatsByService[b.serviceId] ??= []).push(b.nickname)
  }

  const result: MyServiceRow[] = rows.map((r) => ({
    serviceId:    r.serviceId,
    serviceDate:  r.serviceDate,
    serviceType:  r.serviceType,
    customerName: r.customerName,
    boats:        boatsByService[r.serviceId] ?? [],
    totalPrice:   Number(r.totalPrice ?? 0),
    splitPct:     Number(r.splitPct),
    netPay:       Number(r.netPay),
    approved:     r.approvedAt != null,
  }))

  return NextResponse.json({ services: result })
}
