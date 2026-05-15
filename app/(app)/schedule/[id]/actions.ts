'use server'

import { db } from '@/lib/db'
import { serviceBoatAssignments } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { revalidatePath } from 'next/cache'

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

  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/schedule')
}
