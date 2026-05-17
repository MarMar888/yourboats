import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import type { User } from '@/lib/db/schema'

export type CurrentUser = Pick<User, 'id' | 'displayName' | 'role' | 'email'>

/**
 * Returns the current authenticated user.
 *
 * Resolution order:
 *  1. If NEXT_PUBLIC_DEV_AUTH === 'true' → read the dev_user cookie and return
 *     the matching DEV_USERS entry (no DB lookup needed).
 *  2. Otherwise → read the Neon Auth session and return the corresponding
 *     row from the `users` DB table (synced on login).
 *
 * Returns null when unauthenticated.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // ── Dev-auth shortcut ────────────────────────────────────────────────────
  if (process.env.NEXT_PUBLIC_DEV_AUTH === 'true') {
    const cookieStore = await cookies()
    const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
    const devUser = DEV_USERS.find((u) => u.id === devUserId)
    return devUser ?? null
  }

  // ── Neon Auth ─────────────────────────────────────────────────────────────
  try {
    const { auth } = await import('@/lib/auth/server')
    const { data: session, error } = await auth.getSession()
    console.log('[getCurrentUser] session:', JSON.stringify(session), 'error:', JSON.stringify(error))
    if (!session?.user?.email) return null

    const [row] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(eq(users.email, session.user.email))
      .limit(1)

    console.log('[getCurrentUser] db row:', JSON.stringify(row))
    return row ?? null
  } catch (e) {
    console.error('[getCurrentUser] caught:', e)
    return null
  }
}
