import { getCurrentUser, type CurrentUser } from '@/lib/auth/get-current-user'

/**
 * Authorization helpers for server actions.
 *
 * These throw on failure (server actions surface the rejection to the caller).
 * Route handlers should keep returning NextResponse 401/403 inline instead.
 */

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'owner' && user.role !== 'manager') {
    throw new Error('Unauthorized')
  }
  return user
}

export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'owner') throw new Error('Unauthorized')
  return user
}
