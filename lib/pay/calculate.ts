import { db } from '@/lib/db'
import { services, serviceAssignments, customers, users, tierConfig } from '@/lib/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'

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

  // Query services assigned to this user in date range
  const rows = await db
    .select({
      serviceId: services.id,
      serviceDate: services.serviceDate,
      customerId: customers.id,
      customerName: customers.name,
      totalPrice: services.totalPrice,
      tipAmount: services.tipAmount,
      sharePct: serviceAssignments.sharePct,
    })
    .from(serviceAssignments)
    .innerJoin(services, eq(serviceAssignments.serviceId, services.id))
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(
      and(
        eq(serviceAssignments.userId, userId),
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'complete')
      )
    )
    .orderBy(services.serviceDate)

  const servicePays: ServicePay[] = rows.map((row) => {
    const totalPrice = Number(row.totalPrice ?? 0)
    const tipAmount = Number(row.tipAmount ?? 0)
    const sharePct = row.sharePct
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
