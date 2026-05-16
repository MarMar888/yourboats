'use server'

import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Upserts a Neon Auth user into the local `users` table.
 * - Creates the row if it doesn't exist (role defaults to 'employee').
 * - Updates displayName if it changed.
 * Returns the DB user id (UUID).
 */
export async function syncUser(email: string, displayName: string): Promise<string> {
  const [existing] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing) {
    if (existing.displayName !== displayName) {
      await db
        .update(users)
        .set({ displayName })
        .where(eq(users.id, existing.id))
    }
    return existing.id
  }

  const [inserted] = await db
    .insert(users)
    .values({ email, displayName, role: 'employee' })
    .returning({ id: users.id })

  return inserted.id
}
