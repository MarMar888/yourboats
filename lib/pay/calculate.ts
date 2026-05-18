import { db } from '@/lib/db'
import { services, serviceBoatAssignments, customers, users, tierConfig } from '@/lib/db/schema'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { getServiceTypeShareMap, lookupSharePct } from './service-type-shares'

export type ServicePay = {
  serviceId: string
  serviceDate: string
  serviceType: string
  customerId: string
  customerName: string
  totalPrice: number        // full service revenue
  serviceTypeShare: number  // % of revenue going to employee pool (e.g. 55)
  employeePool: number      // totalPrice × serviceTypeShare/100
  tipAmount: number
  splitPct: number          // this employee's raw split of the pool (e.g. 50)
  deductionPct: number      // tier deduction subtracted from split (e.g. 7.5)
  effectivePct: number      // splitPct − deductionPct (e.g. 42.5)
  netPay: number            // employeePool × effectivePct/100
  tipShare: number          // tipAmount × splitPct/100
  totalPay: number          // netPay + tipShare
}

export async function calculateEmployeePay(params: {
  userId: string
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
}): Promise<{
  services: ServicePay[]
  summary: { totalPay: number; totalTips: number }
}> {
  const { userId, startDate, endDate } = params

  // Get employee tier + deduction
  const [employee] = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  let deductionPct = 0
  if (employee?.tier) {
    const [config] = await db
      .select({ deductionPct: tierConfig.deductionPct })
      .from(tierConfig)
      .where(eq(tierConfig.tier, employee.tier))
      .limit(1)
    if (config) deductionPct = Number(config.deductionPct)
  }

  // Find all completed services in range where this user is assigned
  const assignedServiceRows = await db
    .selectDistinct({ serviceId: serviceBoatAssignments.serviceId })
    .from(serviceBoatAssignments)
    .innerJoin(services, eq(serviceBoatAssignments.serviceId, services.id))
    .where(
      and(
        sql`${serviceBoatAssignments.userId} = ${userId}::text`,
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'complete')
      )
    )

  if (assignedServiceRows.length === 0) {
    return { services: [], summary: { totalPay: 0, totalTips: 0 } }
  }

  const serviceIds = assignedServiceRows.map((r) => r.serviceId)

  const shareMap = await getServiceTypeShareMap()

  const { inArray } = await import('drizzle-orm')
  const svcRows = await db
    .select({
      serviceId:    services.id,
      serviceDate:  services.serviceDate,
      serviceType:  services.serviceType,
      customerId:   customers.id,
      customerName: customers.name,
      totalPrice:   services.totalPrice,
      tipAmount:    services.tipAmount,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(inArray(services.id, serviceIds))
    .orderBy(services.serviceDate)

  // Unique user set per service
  const allAssignRows = await db
    .selectDistinct({
      serviceId: serviceBoatAssignments.serviceId,
      userId:    serviceBoatAssignments.userId,
    })
    .from(serviceBoatAssignments)
    .where(inArray(serviceBoatAssignments.serviceId, serviceIds))

  const userSetByService: Record<string, Set<string>> = {}
  for (const a of allAssignRows) {
    ;(userSetByService[a.serviceId] ??= new Set()).add(a.userId)
  }

  const servicePays: ServicePay[] = svcRows.map((row) => {
    const totalPrice = Number(row.totalPrice ?? 0)
    const tipAmount = Number(row.tipAmount ?? 0)

    // Step 1: service-type share → employee pool
    const serviceTypeShare = lookupSharePct(shareMap, row.serviceType)
    const employeePool = totalPrice * (serviceTypeShare / 100)

    // Step 2: equal split among workers
    const userSet = userSetByService[row.serviceId] ?? new Set([userId])
    const count = userSet.size
    const basePct = Math.floor(100 / count)
    const remainder = 100 - basePct * count
    const sortedUsers = Array.from(userSet).sort()
    const userIdx = sortedUsers.indexOf(userId)
    const splitPct = userIdx === count - 1 ? basePct + remainder : basePct

    // Step 3: deduction reduces effective split percentage
    // netPay = pool × (splitPct − deductionPct) / 100
    const effectivePct = Math.max(0, splitPct - deductionPct)
    const netPay = employeePool * (effectivePct / 100)
    const tipShare = tipAmount * (splitPct / 100)
    const totalPay = netPay + tipShare

    return {
      serviceId: row.serviceId,
      serviceDate: row.serviceDate,
      serviceType: row.serviceType,
      customerId: row.customerId,
      customerName: row.customerName,
      totalPrice,
      serviceTypeShare,
      employeePool,
      tipAmount,
      splitPct,
      deductionPct,
      effectivePct,
      netPay,
      tipShare,
      totalPay,
    }
  })

  const summary = servicePays.reduce(
    (acc, s) => ({
      totalPay: acc.totalPay + s.totalPay,
      totalTips: acc.totalTips + s.tipShare,
    }),
    { totalPay: 0, totalTips: 0 }
  )

  return { services: servicePays, summary }
}
