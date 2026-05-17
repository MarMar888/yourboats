import { db } from '@/lib/db'
import { services, serviceBoatAssignments, customers, users, tierConfig } from '@/lib/db/schema'
import { eq, and, gte, lte, sql } from 'drizzle-orm'

export type ServicePay = {
  serviceId: string
  serviceDate: string
  customerId: string
  customerName: string
  totalPrice: number        // service total (before tip)
  tipAmount: number         // tip for this service
  sharePct: number          // this employee's share %
  basePay: number           // totalPrice × sharePct/100
  deductionPct: number      // from tier config
  deduction: number         // basePay × deductionPct/100
  netPay: number            // basePay - deduction
  tipShare: number          // tipAmount × sharePct/100
  totalPay: number          // netPay + tipShare
}

export async function calculateEmployeePay(params: {
  userId: string
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
}): Promise<{
  services: ServicePay[]
  summary: { totalPay: number; totalTips: number; totalDeductions: number }
}> {
  const { userId, startDate, endDate } = params

  // Get employee tier
  const [employee] = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  // Get deduction pct for tier
  let deductionPct = 0
  if (employee?.tier) {
    const [config] = await db
      .select({ deductionPct: tierConfig.deductionPct })
      .from(tierConfig)
      .where(eq(tierConfig.tier, employee.tier))
      .limit(1)
    if (config) deductionPct = Number(config.deductionPct)
  }

  // Find all services where this user is assigned (via serviceBoatAssignments).
  // userId in serviceBoatAssignments is text; users.id is uuid — cast for comparison.
  // We need completed services in the date range.
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
    return { services: [], summary: { totalPay: 0, totalTips: 0, totalDeductions: 0 } }
  }

  const serviceIds = assignedServiceRows.map((r) => r.serviceId)

  // Fetch full service details for those service IDs
  const { inArray } = await import('drizzle-orm')
  const svcRows = await db
    .select({
      serviceId:    services.id,
      serviceDate:  services.serviceDate,
      customerId:   customers.id,
      customerName: customers.name,
      totalPrice:   services.totalPrice,
      tipAmount:    services.tipAmount,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(inArray(services.id, serviceIds))
    .orderBy(services.serviceDate)

  // For each service, count distinct users assigned to determine this user's share
  // Fetch all assignments for these services
  const allAssignRows = await db
    .selectDistinct({
      serviceId: serviceBoatAssignments.serviceId,
      userId:    serviceBoatAssignments.userId,
    })
    .from(serviceBoatAssignments)
    .where(inArray(serviceBoatAssignments.serviceId, serviceIds))

  // Build a map: serviceId -> Set<userId>
  const userSetByService: Record<string, Set<string>> = {}
  for (const a of allAssignRows) {
    ;(userSetByService[a.serviceId] ??= new Set()).add(a.userId)
  }

  const servicePays: ServicePay[] = svcRows.map((row) => {
    const totalPrice = Number(row.totalPrice ?? 0)
    const tipAmount = Number(row.tipAmount ?? 0)

    const userSet = userSetByService[row.serviceId] ?? new Set([userId])
    const count = userSet.size

    // Equal split; if user is last alphabetically they absorb remainder — but
    // for simplicity give each user floor(100/count) and absorb remainder in
    // the share calculation below. Since we only care about THIS user's share:
    const basePct = Math.floor(100 / count)
    const remainder = 100 - basePct * count
    // Check if this user is the "last" one (to absorb remainder)
    const sortedUsers = Array.from(userSet).sort()
    const userIdx = sortedUsers.indexOf(userId)
    const sharePct = userIdx === count - 1 ? basePct + remainder : basePct

    const basePay = totalPrice * (sharePct / 100)
    const deduction = basePay * (deductionPct / 100)
    const netPay = basePay - deduction
    const tipShare = tipAmount * (sharePct / 100)
    const totalPay = netPay + tipShare

    return {
      serviceId: row.serviceId,
      serviceDate: row.serviceDate,
      customerId: row.customerId,
      customerName: row.customerName,
      totalPrice,
      tipAmount,
      sharePct,
      basePay,
      deductionPct,
      deduction,
      netPay,
      tipShare,
      totalPay,
    }
  })

  const summary = servicePays.reduce(
    (acc, s) => ({
      totalPay: acc.totalPay + s.totalPay,
      totalTips: acc.totalTips + s.tipShare,
      totalDeductions: acc.totalDeductions + s.deduction,
    }),
    { totalPay: 0, totalTips: 0, totalDeductions: 0 }
  )

  return { services: servicePays, summary }
}
