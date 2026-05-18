'use server'

import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'

/**
 * Delete all scheduled (future/pending) services for a customer.
 * Child rows (serviceBoats, serviceBoatAssignments, etc.) cascade automatically.
 */
export async function deleteScheduledServices(customerId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return

  const today = new Date()
  const ymd = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  // Delete all scheduled services for this customer (today and future)
  const deleted = await db
    .delete(services)
    .where(
      and(
        eq(services.customerId, customerId),
        eq(services.status, 'scheduled'),
        gte(services.serviceDate, ymd)
      )
    )
    .returning({ id: services.id })

  await log({
    action: 'delete_scheduled_services',
    entityType: 'customer',
    entityId: customerId,
    metadata: { count: deleted.length },
  })

  revalidatePath(`/customers/${customerId}`)
  revalidatePath('/schedule')
}
