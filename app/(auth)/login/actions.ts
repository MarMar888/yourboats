'use server'

import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { syncUser } from '@/lib/auth/sync-user'
import { log } from '@/lib/log'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getPostHogClient } from '@/lib/posthog-server'
import { requestClientOtp } from './client-actions'

// The single email field on /login routes to a password prompt (staff) or a
// one-time code (everyone else). Checked here so the client component knows
// which step to render next. Non-staff always gets the generic OTP flow
// (requestClientOtp's own message), so this can't be used to enumerate staff
// vs. customer vs. unknown accounts beyond "staff or not."
export type LoginRoute = { mode: 'password' } | { mode: 'otp'; message: string }

export async function resolveLogin(email: string): Promise<LoginRoute> {
  const normalized = email.trim().toLowerCase()

  const [staffUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1)

  if (staffUser) return { mode: 'password' }

  const { message } = await requestClientOtp(normalized)
  return { mode: 'otp', message }
}

export async function login(email: string, password: string): Promise<{ error?: string }> {
  const normalized = email.trim().toLowerCase()

  const { data, error } = await auth.signIn.email({ email: normalized, password })

  if (error) {
    return { error: error.message ?? 'Sign-in failed' }
  }

  // Sync the authenticated user into our users table
  if (data?.user) {
    const userId = await syncUser(data.user.email, data.user.name ?? normalized)

    // Fetch role for the log entry
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    await log({
      action: 'login',
      entityType: 'user',
      entityId: userId,
      metadata: { role: row?.role ?? 'unknown' },
    })

    const posthog = getPostHogClient()
    posthog.identify({
      distinctId: userId,
      properties: {
        email: data.user.email,
        name: data.user.name ?? normalized,
        role: row?.role ?? 'unknown',
      },
    })
    posthog.capture({
      distinctId: userId,
      event: 'user_logged_in',
      properties: { role: row?.role ?? 'unknown' },
    })
    await posthog.shutdown()
  }

  redirect('/dashboard')
}

export async function loginWithMagicLink(formData: FormData) {
  const email = formData.get('email') as string

  const { error } = await auth.signIn.magicLink({ email })

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message ?? 'Magic link failed')}`)
  }

  redirect('/login?message=Check your email for a magic link')
}

export async function logout() {
  await auth.signOut()
  redirect('/login')
}
