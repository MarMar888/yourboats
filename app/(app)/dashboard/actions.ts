'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { log } from '@/lib/log'

export async function markComplete(serviceId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const user = DEV_USERS.find((u) => u.id === devUserId)

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Fetch the service to verify it exists and is in a completable state
  const [service] = await db
    .select({ id: services.id, status: services.status })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service) {
    return { error: 'Service not found' }
  }

  if (service.status !== 'scheduled') {
    return { error: 'Service is not in scheduled status' }
  }

  // For dev users: employees, managers, and owners can all complete services
  // (real assignment checks come with real auth)
  await db
    .update(services)
    .set({
      status: 'complete',
      completedAt: new Date(),
      // completedByUserId is a real UUID FK; dev user IDs are fake strings,
      // so we leave it null for now — real auth will populate this field.
      completedByUserId: null,
    })
    .where(eq(services.id, serviceId))

  await log({
    action: 'mark_complete',
    entityType: 'service',
    entityId: serviceId,
    metadata: { devUserId: user.id, role: user.role },
  })

  revalidatePath('/dashboard')

  return {}
}
