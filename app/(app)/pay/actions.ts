'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { tierConfig, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function updateTierConfig(
  tier: 'top' | 'mid' | 'low',
  deductionPct: number
): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') throw new Error('Unauthorized')

  await db
    .update(tierConfig)
    .set({ deductionPct: String(deductionPct), updatedAt: new Date() })
    .where(eq(tierConfig.tier, tier))

  revalidatePath('/pay')
  revalidatePath('/team')
}

export async function updateEmployeeTier(
  userId: string,
  tier: 'top' | 'mid' | 'low' | null
): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') throw new Error('Unauthorized')

  await db
    .update(users)
    .set({ tier })
    .where(eq(users.id, userId))

  revalidatePath('/pay')
  revalidatePath('/team')
}
