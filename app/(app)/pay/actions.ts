'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { tierConfig, users, services } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function saveTip(serviceId: string, tipAmount: number): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) throw new Error('Unauthorized')

  await db
    .update(services)
    .set({ tipAmount: tipAmount > 0 ? String(tipAmount) : null })
    .where(eq(services.id, serviceId))

  revalidatePath('/pay')
}

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
