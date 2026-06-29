import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOAuthClient } from '@/lib/qbo/client'
import { db } from '@/lib/db'
import { qboTokens } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getPostHogClient } from '@/lib/posthog-server'
import { QBO_STATE_COOKIE } from '@/app/api/qbo/connect/route'

export async function GET(request: Request) {
  // Only an owner/manager may bind a QuickBooks realm to this app.
  const qboUser = await getCurrentUser()
  if (!qboUser || (qboUser.role !== 'owner' && qboUser.role !== 'manager')) {
    return NextResponse.redirect(new URL('/settings?qbo=error', request.url))
  }

  // CSRF: the state returned by Intuit must match the value we set in /connect.
  const url = new URL(request.url)
  const returnedState = url.searchParams.get('state')
  const cookieStore = await cookies()
  const expectedState = cookieStore.get(QBO_STATE_COOKIE)?.value
  if (!expectedState || !returnedState || returnedState !== expectedState) {
    const res = NextResponse.redirect(new URL('/settings?qbo=error', request.url))
    res.cookies.delete(QBO_STATE_COOKIE)
    return res
  }

  const oauthClient = getOAuthClient()

  try {
    const authResponse = await oauthClient.createToken(request.url)
    const t = authResponse.getJson()
    const realmId = url.searchParams.get('realmId')!

    await db
      .insert(qboTokens)
      .values({
        id: 1,
        realmId,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + t.x_refresh_token_expires_in * 1000),
      })
      .onConflictDoUpdate({
        target: qboTokens.id,
        set: {
          realmId,
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
          refreshTokenExpiresAt: new Date(Date.now() + t.x_refresh_token_expires_in * 1000),
          updatedAt: new Date(),
        },
      })

    const posthog = getPostHogClient()
    posthog.capture({ distinctId: qboUser.id, event: 'qbo_connected', properties: { realm_id: realmId } })
    await posthog.shutdown()

    const res = NextResponse.redirect(new URL('/settings?qbo=connected', request.url))
    res.cookies.delete(QBO_STATE_COOKIE)
    return res
  } catch (err) {
    console.error('QBO OAuth error', err)
    const res = NextResponse.redirect(new URL('/settings?qbo=error', request.url))
    res.cookies.delete(QBO_STATE_COOKIE)
    return res
  }
}
