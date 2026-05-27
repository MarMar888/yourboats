'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'

type ActionResult = { error?: string }

const AUTH_BASE = process.env.NEON_AUTH_BASE_URL!

/** Derive the app origin from the incoming request so Better Auth accepts the request. */
async function getOrigin(): Promise<string> {
  const reqHeaders = await headers()
  const origin = reqHeaders.get('origin')
  if (origin) return origin
  const host = reqHeaders.get('x-forwarded-host') ?? reqHeaders.get('host') ?? 'localhost:3000'
  const proto = reqHeaders.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

/** Forward the current session cookies + origin to the Neon Auth admin API. */
async function authAdminFetch(path: string, body: object): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const [store, origin] = await Promise.all([cookies(), getOrigin()])
  const cookieHeader = store.toString()

  const res = await fetch(`${AUTH_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookieHeader,
      origin,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    const msg = (payload as { message?: string }).message ?? `Auth error ${res.status}`
    return { ok: false, error: msg }
  }

  const data = await res.json().catch(() => ({}))
  return { ok: true, data }
}

// ─── List team members ────────────────────────────────────────────────────────

export async function listTeamMembers() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') return []
  return db.select().from(users).orderBy(users.createdAt)
}

// ─── Create account ───────────────────────────────────────────────────────────

export async function createTeamAccount(data: {
  email: string
  password: string
  name: string
  role: 'owner' | 'manager' | 'employee'
  tier?: 'top' | 'mid' | 'low' | null
}): Promise<ActionResult> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') return { error: 'Not authorized' }

  const email = data.email.trim().toLowerCase()
  if (!email || !data.password || !data.name.trim()) return { error: 'Name, email, and password are required' }
  if (data.password.length < 8) return { error: 'Password must be at least 8 characters' }

  // 1. Create the auth account via Better Auth admin API
  const authResult = await authAdminFetch('admin/create-user', {
    email,
    password: data.password,
    name: data.name.trim(),
    role: 'user',
  })

  if (!authResult.ok) {
    return { error: authResult.error ?? 'Failed to create auth account' }
  }

  // 2. Create local users table record
  try {
    await db.insert(users).values({
      email,
      displayName: data.name.trim(),
      role: data.role,
      tier: data.tier ?? null,
      active: true,
    })
  } catch (err) {
    // If our users table insert fails, the auth account was created — note this
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { error: 'An account with that email already exists in yourboats' }
    }
    return { error: `Created auth account but failed to save profile: ${msg}` }
  }

  revalidatePath('/settings')
  return {}
}

// ─── Set password ─────────────────────────────────────────────────────────────

export async function setTeamMemberPassword(
  userId: string,
  newPassword: string,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') return { error: 'Not authorized' }
  if (newPassword.length < 8) return { error: 'Password must be at least 8 characters' }

  // Prevent changing your own password here (use change-password form instead)
  if (userId === currentUser.id) return { error: 'Use the Change Password section to update your own password' }

  // Look up the user's email
  const [targetUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!targetUser) return { error: 'User not found' }

  // Find the Better Auth user ID by email using GET /admin/list-users
  const [store, origin] = await Promise.all([cookies(), getOrigin()])
  const cookieHeader = store.toString()

  // Better Auth list-users only supports contains/starts_with/ends_with — no exact match.
  // Search by starts_with (full email) then verify exact match client-side.
  const listRes = await fetch(
    `${AUTH_BASE}/admin/list-users?searchField=email&searchValue=${encodeURIComponent(targetUser.email)}&searchOperator=starts_with`,
    { headers: { cookie: cookieHeader, origin } },
  )

  if (!listRes.ok) {
    const payload = await listRes.json().catch(() => ({}))
    return { error: (payload as { message?: string }).message ?? `Could not find auth account (${listRes.status})` }
  }

  const listData = await listRes.json() as { users?: Array<{ id: string; email: string }> }
  const authUser = (listData.users ?? []).find((u) => u.email === targetUser.email)
  if (!authUser) return { error: 'No auth account found for that email' }

  // Set the password
  const pwResult = await authAdminFetch('admin/set-user-password', {
    userId: authUser.id,
    newPassword,
  })

  if (!pwResult.ok) return { error: pwResult.error ?? 'Failed to set password' }

  return {}
}

// ─── Update team member profile ───────────────────────────────────────────────

export async function updateTeamMember(
  userId: string,
  updates: {
    role?: 'owner' | 'manager' | 'employee'
    tier?: 'top' | 'mid' | 'low' | null
    active?: boolean
    displayName?: string
  },
): Promise<ActionResult> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') return { error: 'Not authorized' }
  if (userId === currentUser.id) return { error: 'Cannot modify your own account here' }

  await db.update(users).set(updates).where(eq(users.id, userId))
  revalidatePath('/settings')
  return {}
}
