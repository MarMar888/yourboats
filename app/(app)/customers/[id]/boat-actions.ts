'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { boats } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'

type ActionResult = { ok: true } | { ok: false; error: string }

export async function updateBoat(
  boatId: string,
  customerId: string,
  input: {
    nickname: string
    makeModel?: string | null
    lengthFt?: number | null
    notes?: string | null
  }
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { ok: false, error: 'Not authorized.' }
  }
  if (!input.nickname.trim()) return { ok: false, error: 'Boat name is required.' }

  await db
    .update(boats)
    .set({
      nickname: input.nickname.trim(),
      makeModel: input.makeModel?.trim() || null,
      lengthFt: input.lengthFt ?? null,
      notes: input.notes?.trim() || null,
    })
    .where(eq(boats.id, boatId))

  await log({ action: 'update_boat', entityType: 'boat', entityId: boatId })
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}

export async function deleteBoat(
  boatId: string,
  customerId: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { ok: false, error: 'Not authorized.' }
  }

  await db.delete(boats).where(eq(boats.id, boatId))
  await log({ action: 'delete_boat', entityType: 'boat', entityId: boatId })
  revalidatePath(`/customers/${customerId}`)
  return { ok: true }
}
