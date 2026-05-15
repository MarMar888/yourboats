'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { complaints } from '@/lib/db/schema'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'

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

  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/complaints')
}
