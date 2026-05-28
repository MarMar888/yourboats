import { db } from '@/lib/db'
import { payroll } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getServiceTypeShareMap, lookupSharePct } from './service-type-shares'

/**
 * When a service's totalPrice changes (via invoice edit or schedule edit),
 * propagate the new price to any saved payroll records for that service.
 * Re-derives employeePool from the service type share and recalculates
 * netPay / totalPay for each employee row.
 */
export async function syncPayrollPriceForService(
  serviceId: string,
  serviceType: string,
  newTotalPrice: number
) {
  const rows = await db
    .select({ userId: payroll.userId, effectivePct: payroll.effectivePct, tipShare: payroll.tipShare })
    .from(payroll)
    .where(eq(payroll.serviceId, serviceId))

  if (rows.length === 0) return

  const shareMap = await getServiceTypeShareMap()
  const newPool = newTotalPrice * (lookupSharePct(shareMap, serviceType) / 100)

  await Promise.all(rows.map((row) => {
    const effectivePct = parseFloat(row.effectivePct) || 0
    const tipShare = parseFloat(row.tipShare ?? '0') || 0
    const newNetPay = newPool * (effectivePct / 100)
    const newTotalPay = newNetPay + tipShare
    return db.update(payroll)
      .set({
        totalPrice: String(newTotalPrice),
        employeePool: String(newPool),
        netPay: String(newNetPay),
        totalPay: String(newTotalPay),
      })
      .where(and(eq(payroll.serviceId, serviceId), eq(payroll.userId, row.userId)))
  }))
}
