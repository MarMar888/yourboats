import { cache } from 'react'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { isDevAuthEnabled } from '@/lib/auth/dev-auth'
import { DEMO_ROLES, DEMO_USER_COOKIE, isDemoModeEnabled } from '@/lib/demo-mode'
import type { User } from '@/lib/db/schema'

export type CurrentUser = Pick<User, 'id' | 'displayName' | 'role' | 'email'>

/**
 * Returns the current authenticated user.
 *
 * Resolution order:
 *  1. If dev auth is enabled (NEXT_PUBLIC_DEV_AUTH === 'true' and not a prod
 *     deploy) → read the dev_user cookie and return the matching DEV_USERS
 *     entry (no DB lookup needed).
 *  2. If demo mode is enabled (NEXT_PUBLIC_DEMO_MODE === 'true' and not a
 *     prod deploy — the `demo` branch deployment, its own seeded database) →
 *     read the demo_role cookie and look up the matching seeded demo user
 *     by email.
 *  3. Otherwise → read the Neon Auth session and return the corresponding
 *     row from the `users` DB table (synced on login).
 *
 * Returns null when unauthenticated.
 */
async function resolveCurrentUser(): Promise<CurrentUser | null> {
  // ── Dev-auth shortcut ────────────────────────────────────────────────────
  if (isDevAuthEnabled()) {
    const cookieStore = await cookies()
    const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
    const devUser = DEV_USERS.find((u) => u.id === devUserId)
    return devUser ?? null
  }

  // ── Demo mode ────────────────────────────────────────────────────────────
  if (isDemoModeEnabled()) {
    const cookieStore = await cookies()
    const demoRole = cookieStore.get(DEMO_USER_COOKIE)?.value
    const match = DEMO_ROLES.find((r) => r.role === demoRole)
    if (!match) return null

    const [row] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(eq(users.email, match.email))
      .limit(1)

    return row ?? null
  }

  // ── Neon Auth ─────────────────────────────────────────────────────────────
  try {
    const { auth } = await import('@/lib/auth/server')
    const { data: session } = await auth.getSession()
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

    return row ?? null
  } catch {
    return null
  }
}

export const getCurrentUser = cache(resolveCurrentUser)
