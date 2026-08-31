import { db } from '@/lib/db'
import { services, customers, serviceBoatAssignments, serviceBoats, boats, users } from '@/lib/db/schema'
import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm'

export type SeasonTipJob = {
  serviceId: string
  serviceDate: string
  serviceType: string
  customerName: string
  boats: string[]
  tipAmount: number   // full tip recorded on the service
  workerCount: number // people it's split across
  tipShare: number    // this employee's even split of tipAmount
}

/**
 * Tips a single employee is owed across a whole season, independent of pay
 * periods or payroll approval — split evenly per job the same way
 * refreshServicePayroll does, computed live from services + assignments
 * rather than from the (possibly not-yet-approved) payroll table.
 */
export async function getSeasonTips(params: {
  userId: string
  startDate: string
  endDate: string
}): Promise<{ jobs: SeasonTipJob[]; totalTips: number }> {
  const { userId, startDate, endDate } = params

  const assignedServiceRows = await db
    .selectDistinct({ serviceId: serviceBoatAssignments.serviceId })
    .from(serviceBoatAssignments)
    .innerJoin(services, eq(serviceBoatAssignments.serviceId, services.id))
    .where(
      and(
        sql`${serviceBoatAssignments.userId} = ${userId}::text`,
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'complete'),
        sql`${services.tipAmount} > 0`
      )
    )

  if (assignedServiceRows.length === 0) {
    return { jobs: [], totalTips: 0 }
  }
  const serviceIds = assignedServiceRows.map((r) => r.serviceId)

  const svcRows = await db
    .select({
      serviceId: services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      customerName: customers.name,
      tipAmount: services.tipAmount,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(inArray(services.id, serviceIds))
    .orderBy(services.serviceDate)

  // Valid (still-existing) assignees per service — mirrors refreshServicePayroll's
  // inner join to users, which silently drops assignments to deleted employees.
  const assignRows = await db
    .selectDistinct({
      serviceId: serviceBoatAssignments.serviceId,
      userId: serviceBoatAssignments.userId,
    })
    .from(serviceBoatAssignments)
    .innerJoin(users, sql`${users.id}::text = ${serviceBoatAssignments.userId}`)
    .where(inArray(serviceBoatAssignments.serviceId, serviceIds))

  const workerIdsByService: Record<string, Set<string>> = {}
  for (const a of assignRows) {
    ;(workerIdsByService[a.serviceId] ??= new Set()).add(a.userId)
  }

  const boatRows = await db
    .select({ serviceId: serviceBoats.serviceId, nickname: boats.nickname })
    .from(serviceBoats)
    .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
    .where(inArray(serviceBoats.serviceId, serviceIds))
  const boatsByService: Record<string, string[]> = {}
  for (const b of boatRows) {
    ;(boatsByService[b.serviceId] ??= []).push(b.nickname)
  }

  const jobs: SeasonTipJob[] = svcRows.map((s) => {
    const tipAmount = Number(s.tipAmount ?? 0)
    const workerCount = workerIdsByService[s.serviceId]?.size ?? 1
    return {
      serviceId: s.serviceId,
      serviceDate: s.serviceDate,
      serviceType: s.serviceType,
      customerName: s.customerName,
      boats: boatsByService[s.serviceId] ?? [],
      tipAmount,
      workerCount,
      tipShare: workerCount > 0 ? tipAmount / workerCount : 0,
    }
  })

  const totalTips = jobs.reduce((sum, j) => sum + j.tipShare, 0)
  return { jobs, totalTips }
}
