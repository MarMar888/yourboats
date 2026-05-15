import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { syncUser } from '@/lib/auth/sync-user'

/**
 * Magic-link / OAuth callback.
 * Neon Auth handles token exchange via /api/auth/[...path].
 * This route can be used as a post-login redirect to sync the user into the DB.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url)

  try {
    const { data: session } = await auth.getSession()
    if (session?.user) {
      await syncUser(session.user.email, session.user.name ?? session.user.email)
    }
  } catch {
    // Non-fatal — user will be synced on next page load if needed
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
