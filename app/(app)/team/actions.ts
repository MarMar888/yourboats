'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { randomBytes, scrypt } from 'crypto'
import { sql } from 'drizzle-orm'

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex') // 32-char hex salt
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, hash) => {
      if (err) reject(err)
      else resolve(`${salt}:${hash.toString('hex')}`)
    })
  })
}

export async function createUser(input: {
  displayName: string
  email: string
  password: string
  role: 'owner' | 'manager' | 'employee'
}): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'owner') {
    return { error: 'Only owners can create users.' }
  }

  const { displayName, email, password, role } = input

  if (!displayName.trim() || !email.trim() || !password) {
    return { error: 'Name, email and password are required.' }
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Check both tables — neon_auth.user and app users — for the email
  const [authCheck, [existingApp]] = await Promise.all([
    db.execute(sql`SELECT id FROM neon_auth.user WHERE email = ${normalizedEmail} LIMIT 1`),
    db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1),
  ])
  if (authCheck.rows.length > 0 || existingApp) return { error: 'An account with that email already exists.' }

  const hashedPassword = await hashPassword(password)
  const authUserId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  const now = new Date()

  // 1. Create Neon Auth user
  try {
    await db.execute(
      sql`INSERT INTO neon_auth.user (id, name, email, "emailVerified", "createdAt", "updatedAt")
          VALUES (${authUserId}, ${displayName.trim()}, ${normalizedEmail}, true, ${now}, ${now})`
    )
  } catch (err: unknown) {
    const code = (err as { cause?: { code?: string } })?.cause?.code
    if (code === '23505') return { error: 'An account with that email already exists.' }
    throw err
  }

  // 2. Create credential account (for email/password login)
  await db.execute(
    sql`INSERT INTO neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        VALUES (${accountId}, ${normalizedEmail}, 'credential', ${authUserId}, ${hashedPassword}, ${now}, ${now})`
  )

  // 3. Create app-level user (synced by email on first login, but pre-created here)
  await db.insert(users).values({
    email: normalizedEmail,
    displayName: displayName.trim(),
    role,
    active: true,
  })

  revalidatePath('/team')
  return {}
}

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
