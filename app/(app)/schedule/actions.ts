'use server'

import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { and, gte, lte, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { log } from '@/lib/log'

export async function markComplete(serviceId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const user = DEV_USERS.find((u) => u.id === devUserId)
  if (!user) return { error: 'Not authenticated' }

  const [service] = await db
    .select({ id: services.id, status: services.status })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service) return { error: 'Service not found' }
  if (service.status !== 'scheduled') return { error: 'Service is not scheduled' }

  await db
    .update(services)
    .set({ status: 'complete', completedAt: new Date(), completedByUserId: null })
    .where(eq(services.id, serviceId))

  await log({ action: 'mark_complete', entityType: 'service', entityId: serviceId })
  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  return {}
}

// ─── Delete service (cascades to invoice, serviceBoats, assignments) ──────────

export async function deleteService(serviceId: string, redirectTo?: string): Promise<void> {
  await db.delete(services).where(eq(services.id, serviceId))
  await log({ action: 'delete_service', entityType: 'service', entityId: serviceId })
  revalidatePath('/schedule')
  revalidatePath('/invoices')
  if (redirectTo) redirect(redirectTo)
}

export async function approveWeek(formData: FormData) {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  if (!devUser || (devUser.role !== 'owner' && devUser.role !== 'manager')) return

  const startDate = formData.get('startDate') as string
  const endDate = formData.get('endDate') as string

  await db
    .update(services)
    .set({ approvedAt: new Date(), approvedByUserId: devUser.id })
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'scheduled')
      )
    )

  revalidatePath('/schedule')
}
