import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  services, customers, serviceAssignments,
  serviceBoats, boats, users, tierConfig,
} from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export type AssignmentRow = {
  userId: string
  displayName: string
  sharePct: number
  basePay: number
  deductionPct: number
  netPay: number
}

export type PeriodServiceRow = {
  serviceId: string
  serviceDate: string
  customerName: string
  boats: string[]
  totalPrice: number
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
      totalPrice:  services.totalPrice,
      tipAmount:   services.tipAmount,
      customerId:  services.customerId,
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

  // 3. Assignments per service (with user tier)
  const assignRows = await db
    .select({
      serviceId:   serviceAssignments.serviceId,
      userId:      serviceAssignments.userId,
      sharePct:    serviceAssignments.sharePct,
      displayName: users.displayName,
      tier:        users.tier,
    })
    .from(serviceAssignments)
    .innerJoin(users, eq(serviceAssignments.userId, users.id))
    .where(inArray(serviceAssignments.serviceId, svcIds))

  // 4. Tier config for deductions
  const tierRows = await db.select().from(tierConfig)
  const deductionByTier: Record<string, number> = {}
  for (const t of tierRows) deductionByTier[t.tier] = Number(t.deductionPct)

  // 5. Group assignments by service
  const assignsByService: Record<string, AssignmentRow[]> = {}
  for (const a of assignRows) {
    const deductionPct = a.tier ? (deductionByTier[a.tier] ?? 0) : 0
    const basePay = 0 // filled per-service below
    ;(assignsByService[a.serviceId] ??= []).push({
      userId: a.userId,
      displayName: a.displayName,
      sharePct: a.sharePct,
      basePay,
      deductionPct,
      netPay: 0,
    })
  }

  // 6. Assemble rows with pay math
  const result: PeriodServiceRow[] = svcRows.map((s) => {
    const totalPrice = Number(s.totalPrice ?? 0)
    const tipAmount = s.tipAmount != null ? Number(s.tipAmount) : null
    const assignments = (assignsByService[s.id] ?? []).map((a) => {
      const basePay = totalPrice * (a.sharePct / 100)
      const netPay = basePay * (1 - a.deductionPct / 100)
      return { ...a, basePay, netPay }
    })
    const totalNetPay = assignments.reduce((sum, a) => sum + a.netPay, 0)

    return {
      serviceId: s.id,
      serviceDate: s.serviceDate,
      customerName: s.customerName,
      boats: boatsByService[s.id] ?? [],
      totalPrice,
      tipAmount,
      assignments,
      totalNetPay,
    }
  })

  return NextResponse.json({ services: result })
}
