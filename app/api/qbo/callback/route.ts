import { NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/qbo/client'
import { db } from '@/lib/db'
import { qboTokens } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getPostHogClient } from '@/lib/posthog-server'

export async function GET(request: Request) {
  const oauthClient = getOAuthClient()

  try {
    const authResponse = await oauthClient.createToken(request.url)
    const t = authResponse.getJson()
    const realmId = new URL(request.url).searchParams.get('realmId')!

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

    const qboUser = await getCurrentUser()
    if (qboUser) {
      const posthog = getPostHogClient()
      posthog.capture({ distinctId: qboUser.id, event: 'qbo_connected', properties: { realm_id: realmId } })
      await posthog.shutdown()
    }

    return NextResponse.redirect(new URL('/settings?qbo=connected', request.url))
  } catch (err) {
    console.error('QBO OAuth error', err)
    return NextResponse.redirect(new URL('/settings?qbo=error', request.url))
  }
}
