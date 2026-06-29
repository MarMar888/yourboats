import { NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/qbo/client'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export const QBO_STATE_COOKIE = 'qbo_oauth_state'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // CSRF state — persisted in an httpOnly cookie and verified in the callback.
  const state = crypto.randomUUID()

  const oauthClient = getOAuthClient()
  const authUri = oauthClient.authorizeUri({
    scope: ['com.intuit.quickbooks.accounting'],
    state,
  })

  const res = NextResponse.redirect(authUri)
  res.cookies.set(QBO_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes — long enough to complete the Intuit consent flow
  })
  return res
}
