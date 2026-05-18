'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { syncUser } from '@/lib/auth/sync-user'
import { log } from '@/lib/log'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function login(formData: FormData) {
  const username = (formData.get('username') as string ?? '').trim().toLowerCase()
  const email = username.includes('@') ? username : `${username}@squeakycleanboats.com`
  const password = formData.get('password') as string

  const { data, error } = await auth.signIn.email({ email, password })

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message ?? 'Sign-in failed')}`)
  }

  // Sync the authenticated user into our users table
  if (data?.user) {
    const userId = await syncUser(data.user.email, data.user.name ?? email)

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
