'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { complaints, serviceBoatAssignments } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { log } from '@/lib/log'

export async function flagComplaint(
  serviceId: string,
  customerId: string,
  description: string,
  severity: 'minor' | 'major'
) {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const user = DEV_USERS.find((u) => u.id === devUserId)

  if (!user) throw new Error('Not authenticated')
  if (!description.trim()) throw new Error('Description is required')

  await db.insert(complaints).values({
    serviceId,
    customerId,
    description: description.trim(),
    severity,
    resolved: false,
    createdByUserId: user.id,
  })

  await log({ action: 'flag_complaint', entityType: 'service', entityId: serviceId, meta: { customerId, severity } })
  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/complaints')
}

export async function updateBoatAssignments(
  serviceId: string,
  boatId: string,
  userIds: string[]
): Promise<void> {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  if (!devUser || (devUser.role !== 'owner' && devUser.role !== 'manager')) return

  await db
    .delete(serviceBoatAssignments)
    .where(
      and(
        eq(serviceBoatAssignments.serviceId, serviceId),
        eq(serviceBoatAssignments.boatId, boatId)
      )
    )

  if (userIds.length > 0) {
    await db.insert(serviceBoatAssignments).values(
      userIds.map((userId) => ({ serviceId, boatId, userId }))
    )
  }

  await log({ action: 'update_boat_assignment', entityType: 'service', entityId: serviceId, meta: { boatId, userIds } })
  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/schedule')
}
