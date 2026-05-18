import { db } from '@/lib/db'
import { serviceTypeShares } from '@/lib/db/schema'

export const DEFAULT_SERVICE_TYPE_SHARE = 50

/**
 * Fetch all service-type share percentages from the DB as a plain map.
 * Call once per request and pass the result to lookupSharePct().
 */
export async function getServiceTypeShareMap(): Promise<Record<string, number>> {
  const rows = await db.select().from(serviceTypeShares)
  const map: Record<string, number> = {}
  for (const r of rows) map[r.serviceType] = Number(r.employeeSharePct)
  return map
}

/**
 * Look up the employee pay-pool share % for a service type.
 * Pass the map returned by getServiceTypeShareMap().
 */
export function lookupSharePct(map: Record<string, number>, serviceType: string): number {
  return map[serviceType] ?? DEFAULT_SERVICE_TYPE_SHARE
}
