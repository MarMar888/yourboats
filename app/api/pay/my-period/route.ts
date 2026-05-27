import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  services, customers, serviceBoatAssignments,
  serviceBoats, boats, users, tierConfig,
} from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getServiceTypeShareMap, lookupSharePct } from '@/lib/pay/service-type-shares'

export type MyServiceRow = {
  serviceId: string
  serviceDate: string
  serviceType: string
  customerName: string
  boats: string[]
  totalPrice: number
  splitPct: number        // their share of the employee pool (e.g. 50)
  netPay: number          // what they actually earn
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

  // 1. Completed services in range where this user appears in assignments
  const myAssignRows = await db
    .select({ serviceId: serviceBoatAssignments.serviceId })
    .from(serviceBoatAssignments)
    .where(sql`${serviceBoatAssignments.userId} = ${user.id}::text`)

  const myServiceIds = Array.from(new Set(myAssignRows.map((r) => r.serviceId)))

  if (myServiceIds.length === 0) {
    return NextResponse.json({ services: [] })
  }

  // 2. Completed services in that range, limited to their IDs
  const svcRows = await db
    .select({
      id:          services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      totalPrice:  services.totalPrice,
      customerName: customers.name,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'complete'),
        inArray(services.id, myServiceIds)
      )
    )
    .orderBy(services.serviceDate)

  if (svcRows.length === 0) {
    return NextResponse.json({ services: [] })
  }

  const svcIds = svcRows.map((s) => s.id)

  // 3. Boats per service
  const boatRows = await db
    .select({ serviceId: serviceBoats.serviceId, label: boats.nickname })
    .from(serviceBoats)
    .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
    .where(inArray(serviceBoats.serviceId, svcIds))

  const boatsByService: Record<string, string[]> = {}
  for (const b of boatRows) {
    ;(boatsByService[b.serviceId] ??= []).push(b.label)
  }

  // 4. All unique workers per service (to compute split %)
  const allAssignRows = await db
    .select({ serviceId: serviceBoatAssignments.serviceId, userId: serviceBoatAssignments.userId })
    .from(serviceBoatAssignments)
    .where(inArray(serviceBoatAssignments.serviceId, svcIds))

  // Unique workers per service
  const workersByService: Record<string, Set<string>> = {}
  for (const a of allAssignRows) {
    ;(workersByService[a.serviceId] ??= new Set()).add(a.userId)
  }

  // 5. Tier config + service type share map
  const [tierRows, shareMap] = await Promise.all([
    db.select().from(tierConfig),
    getServiceTypeShareMap(),
  ])
  const deductionByTier: Record<string, number> = {}
  for (const t of tierRows) deductionByTier[t.tier] = Number(t.deductionPct)

  // 6. The current user's tier
  const [userRecord] = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  const myTier = userRecord?.tier ?? null
  const myDeductionPct = myTier ? (deductionByTier[myTier] ?? 0) : 0

  // 7. Assemble
  const result: MyServiceRow[] = svcRows.map((s) => {
    const totalPrice = Number(s.totalPrice ?? 0)
    const serviceTypeShare = lookupSharePct(shareMap, s.serviceType)
    const employeePool = totalPrice * (serviceTypeShare / 100)

    const workers = workersByService[s.id] ?? new Set()
    const count = workers.size || 1
    // Even split; this user gets floor(100/count) + remainder if last
    const basePct = Math.floor(100 / count)
    const remainder = 100 - basePct * count
    // Give the current user the base pct (remainder goes to "last" — conservative)
    const splitPct = basePct + (count === 1 ? remainder : 0)

    const effectivePct = Math.max(0, splitPct - myDeductionPct)
    const netPay = employeePool * (effectivePct / 100)

    return {
      serviceId:   s.id,
      serviceDate: s.serviceDate,
      serviceType: s.serviceType,
      customerName: s.customerName,
      boats:       boatsByService[s.id] ?? [],
      totalPrice,
      splitPct,
      netPay,
    }
  })

  return NextResponse.json({ services: result })
}
