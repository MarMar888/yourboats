'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'

export async function updateServiceNotes(serviceId: string, notes: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    throw new Error('Unauthorized')
  }

  await db
    .update(services)
    .set({ notes: notes.trim() || null })
    .where(eq(services.id, serviceId))

  await log({ action: 'update_service_notes', entityType: 'service', entityId: serviceId })
  revalidatePath(`/schedule/${serviceId}`)
}
