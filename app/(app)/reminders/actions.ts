'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'

export async function setReminderSuppressed(
  serviceId: string,
  suppressed: boolean
): Promise<void> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) return

  await db
    .update(services)
    .set({ reminderSuppressed: suppressed })
    .where(eq(services.id, serviceId))

  await log({
    action: suppressed ? 'suppress_reminder' : 'unsuppress_reminder',
    entityType: 'service',
    entityId: serviceId,
  })
  revalidatePath('/reminders')
}
