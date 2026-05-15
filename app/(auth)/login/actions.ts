'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { syncUser } from '@/lib/auth/sync-user'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await auth.signIn.email({ email, password })

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message ?? 'Sign-in failed')}`)
  }

  // Sync the authenticated user into our users table
  if (data?.user) {
    await syncUser(data.user.email, data.user.name ?? email)
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
