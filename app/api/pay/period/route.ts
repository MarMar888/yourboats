import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  services, customers, serviceBoatAssignments,
  serviceBoats, boats, users, tierConfig,
} from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getServiceTypeShare } from '@/lib/pay/service-type-shares'

export type AssignmentRow = {
  userId: string
  displayName: string
  splitPct: number        // raw split of the pool (e.g. 50)
  deductionPct: number    // tier deduction subtracted from split
  effectivePct: number    // splitPct − deductionPct
  netPay: number          // employeePool × effectivePct/100
}

export type PeriodServiceRow = {
  serviceId: string
  serviceDate: string
  serviceType: string
  serviceTypeShare: number   // % of revenue going to employee pool
  customerName: string
  boats: string[]
  totalPrice: number
  employeePool: number       // totalPrice × serviceTypeShare/100
  tipAmount: number | null
  assignments: AssignmentRow[]
  totalNetPay: number
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // 1. Completed services in range
  const svcRows = await db
    .select({
      id:          services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      totalPrice:  services.totalPrice,
      tipAmount:   services.tipAmount,
      customerName: customers.name,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'complete')
      )
    )
    .orderBy(services.serviceDate)

  if (svcRows.length === 0) {
    return NextResponse.json({ services: [] })
  }

  const svcIds = svcRows.map((s) => s.id)

  // 2. Boats per service
  const boatRows = await db
    .select({
      serviceId: serviceBoats.serviceId,
      label: boats.nickname,
    })
    .from(serviceBoats)
    .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
    .where(inArray(serviceBoats.serviceId, svcIds))

  const boatsByService: Record<string, string[]> = {}
  for (const b of boatRows) {
    ;(boatsByService[b.serviceId] ??= []).push(b.label)
  }

  // 3. Assignments per service (deduplicated — one row per user per service)
  const assignRows = await db
    .select({
      serviceId:   serviceBoatAssignments.serviceId,
      userId:      serviceBoatAssignments.userId,
      displayName: users.displayName,
      tier:        users.tier,
    })
    .from(serviceBoatAssignments)
    .innerJoin(users, sql`${users.id}::text = ${serviceBoatAssignments.userId}`)
    .where(inArray(serviceBoatAssignments.serviceId, svcIds))

  // 4. Tier deduction config
  const tierRows = await db.select().from(tierConfig)
  const deductionByTier: Record<string, number> = {}
  for (const t of tierRows) deductionByTier[t.tier] = Number(t.deductionPct)

  // 5. Deduplicate: a user may appear multiple times per service (one per boat)
  const uniqueByService: Record<string, Map<string, { displayName: string; tier: string | null }>> = {}
  for (const a of assignRows) {
    const map = (uniqueByService[a.serviceId] ??= new Map())
    if (!map.has(a.userId)) {
      map.set(a.userId, { displayName: a.displayName, tier: a.tier })
    }
  }

  // 6. Assemble rows with full pay math
  const result: PeriodServiceRow[] = svcRows.map((s) => {
    const totalPrice = Number(s.totalPrice ?? 0)
    const tipAmount = s.tipAmount != null ? Number(s.tipAmount) : null

    // Service-type share determines the employee pay pool
    const serviceTypeShare = getServiceTypeShare(s.serviceType)
    const employeePool = totalPrice * (serviceTypeShare / 100)

    const userMap = uniqueByService[s.id]

    if (!userMap || userMap.size === 0) {
      return {
        serviceId:       s.id,
        serviceDate:     s.serviceDate,
        serviceType:     s.serviceType,
        serviceTypeShare,
        customerName:    s.customerName,
        boats:           boatsByService[s.id] ?? [],
        totalPrice,
        employeePool,
        tipAmount,
        assignments:     [],
        totalNetPay:     0,
      }
    }

    const userEntries = Array.from(userMap.entries())
    const count = userEntries.length
    // Equal split; last employee absorbs rounding remainder
    const basePct = Math.floor(100 / count)
    const remainder = 100 - basePct * count

    const assignments: AssignmentRow[] = userEntries.map(([userId, info], idx) => {
      const splitPct = idx === count - 1 ? basePct + remainder : basePct
      const deductionPct = info.tier ? (deductionByTier[info.tier] ?? 0) : 0
      // Deduction reduces effective split: netPay = pool × (splitPct − deductionPct)/100
      const effectivePct = Math.max(0, splitPct - deductionPct)
      const netPay = employeePool * (effectivePct / 100)
      return {
        userId,
        displayName: info.displayName,
        splitPct,
        deductionPct,
        effectivePct,
        netPay,
      }
    })

    const totalNetPay = assignments.reduce((sum, a) => sum + a.netPay, 0)

    return {
      serviceId: s.id,
      serviceDate: s.serviceDate,
      serviceType: s.serviceType,
      serviceTypeShare,
      customerName: s.customerName,
      boats: boatsByService[s.id] ?? [],
      totalPrice,
      employeePool,
      tipAmount,
      assignments,
      totalNetPay,
    }
  })

  return NextResponse.json({ services: result })
}
