import QuickBooks from 'node-quickbooks'
import OAuthClient from 'intuit-oauth'
import { db } from '@/lib/db'
import { qboTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export function getOAuthClient() {
  return new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    environment: (process.env.QBO_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production',
    redirectUri: process.env.QBO_REDIRECT_URI!,
  })
}

/**
 * Fetch the customer-facing payment link for a QBO invoice.
 * Requires include=invoiceLink — not supported by node-quickbooks' getInvoice.
 * Returns null if the invoice has no payment link (e.g. BillEmail not set).
 */
export async function fetchQboInvoiceLink(qboInvoiceId: string): Promise<string | null> {
  const qbo = await getQboClient() as any
  const base = qbo.useSandbox
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com'
  const res = await fetch(
    `${base}/v3/company/${qbo.realmId}/invoice/${qboInvoiceId}?include=invoiceLink&minorversion=65`,
    { headers: { Authorization: `Bearer ${qbo.token}`, Accept: 'application/json' } }
  )
  const data = await res.json()
  return data?.Invoice?.InvoiceLink ?? null
}

export async function getQboClient(): Promise<InstanceType<typeof QuickBooks>> {
  const [tokens] = await db.select().from(qboTokens).where(eq(qboTokens.id, 1)).limit(1)
  if (!tokens) throw new Error('QuickBooks not connected. Owner must complete OAuth.')

  // Refresh if access token is within 5 minutes of expiry
  if (tokens.accessTokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    const now = Date.now()
    const oauthClient = getOAuthClient()
    // Pass actual remaining lifetimes — intuit-oauth's refresh() calls
    // isRefreshTokenValid() internally and rejects immediately if
    // x_refresh_token_expires_in is 0, which would make every refresh fail.
    oauthClient.setToken({
      realmId: tokens.realmId,
      token_type: 'bearer',
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: Math.max(0, Math.floor((tokens.accessTokenExpiresAt.getTime() - now) / 1000)),
      x_refresh_token_expires_in: Math.max(1, Math.floor((tokens.refreshTokenExpiresAt.getTime() - now) / 1000)),
    })
    try {
      const refreshed = await oauthClient.refresh()
      const t = refreshed.getJson()
      await db
        .update(qboTokens)
        .set({
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
          refreshTokenExpiresAt: new Date(Date.now() + t.x_refresh_token_expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(qboTokens.id, 1))
      tokens.accessToken = t.access_token
    } catch (err) {
      // If refresh fails (e.g. refresh token revoked), wipe the stored tokens so
      // the settings page correctly shows "Not connected" instead of silently
      // failing on every subsequent QBO call.
      await db.delete(qboTokens).where(eq(qboTokens.id, 1))
      throw new Error(`QuickBooks token refresh failed — please reconnect in Settings. (${err instanceof Error ? err.message : String(err)})`)
    }
  }

  const useSandbox = (process.env.QBO_ENVIRONMENT ?? 'sandbox') === 'sandbox'

  return new QuickBooks(
    process.env.QUICKBOOKS_CLIENT_ID!,
    process.env.QUICKBOOKS_CLIENT_SECRET!,
    tokens.accessToken,
    false,
    tokens.realmId,
    useSandbox,
    false,
    '65',   // minorversion 37+ required for InvoiceLink
    '2.0',
    tokens.refreshToken
  )
}
