'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function updateUserRole(
  userId: string,
  role: 'owner' | 'manager' | 'employee'
): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') {
    return { error: 'Only owners can change user roles.' }
  }

  await db.update(users).set({ role }).where(eq(users.id, userId))
  revalidatePath('/team')
  return {}
}

export async function updateUserTier(
  userId: string,
  tier: 'top' | 'mid' | 'low' | null
): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') {
    return { error: 'Only owners can change employee tiers.' }
  }

  await db.update(users).set({ tier }).where(eq(users.id, userId))
  revalidatePath('/team')
  revalidatePath('/pay')
  return {}
}

export async function toggleUserActive(userId: string): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') {
    return { error: 'Only owners can deactivate or reactivate users.' }
  }

  const [user] = await db
    .select({ active: users.active })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return { error: 'User not found.' }

  await db.update(users).set({ active: !user.active }).where(eq(users.id, userId))
  revalidatePath('/team')
  return {}
}
