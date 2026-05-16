'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { complaints, serviceBoatAssignments } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function flagComplaint(
  serviceId: string,
  customerId: string,
  description: string,
  severity: 'minor' | 'major'
) {
  const currentUser = await getCurrentUser()

  if (!currentUser) throw new Error('Not authenticated')
  if (!description.trim()) throw new Error('Description is required')

  await db.insert(complaints).values({
    serviceId,
    customerId,
    description: description.trim(),
    severity,
    resolved: false,
    createdByUserId: currentUser.id,
  })

  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/complaints')
}

export async function updateBoatAssignments(
  serviceId: string,
  boatId: string,
  userIds: string[]
): Promise<void> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) return

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

  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/schedule')
}
