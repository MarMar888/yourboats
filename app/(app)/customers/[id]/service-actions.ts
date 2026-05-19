'use server'

import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { todayET } from '@/lib/date'

/**
 * Delete all scheduled (future/pending) services for a customer.
 * Child rows (serviceBoats, serviceBoatAssignments, etc.) cascade automatically.
 */
export async function deleteScheduledServices(customerId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return

  const ymd = todayET()

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
