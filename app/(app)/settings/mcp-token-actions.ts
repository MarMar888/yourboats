'use server'

import { randomBytes, createHash } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { mcpTokens } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'

const PREFIX = 'fl_mcp_'

// Must match lib/mcp/verify-token.ts hashing exactly.
function hashToken(raw: string): string {
  const pepper = process.env.MCP_TOKEN_PEPPER ?? ''
  return createHash('sha256').update(pepper + raw).digest('hex')
}

export type McpTokenRow = {
  id: string
  name: string
  tokenPrefix: string
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  userId: string
}

// Any authenticated (real) user can mint a token for themselves. The token's
// power follows the user's current role at verify time.
export async function createMcpToken(input: {
  name: string
  expiresDays: number
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  // Dev users have non-UUID ids → would violate the users FK. Require real login.
  if (process.env.NEXT_PUBLIC_DEV_AUTH === 'true') {
    return { ok: false, error: 'MCP tokens require a real (non-dev) login.' }
  }

  const name = input.name?.trim() || 'Unnamed token'
  const days = Number.isFinite(input.expiresDays) ? input.expiresDays : 90
  const raw = PREFIX + randomBytes(32).toString('base64url')

  await db.insert(mcpTokens).values({
    userId: user.id,
    name,
    tokenHash: hashToken(raw),
    tokenPrefix: raw.slice(0, 12),
    createdByUserId: user.id,
    expiresAt: days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null,
  })

  revalidatePath('/settings')
  return { ok: true, token: raw } // shown once; only the hash is stored
}

export async function revokeMcpToken(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  // Owner can revoke anyone's token; everyone else only their own.
  const where =
    user.role === 'owner'
      ? eq(mcpTokens.id, id)
      : and(eq(mcpTokens.id, id), eq(mcpTokens.userId, user.id))
  await db.update(mcpTokens).set({ revokedAt: new Date() }).where(where)
  revalidatePath('/settings')
  return { ok: true }
}

export async function listMcpTokens(): Promise<McpTokenRow[]> {
  const user = await getCurrentUser()
  if (!user) return []
  // Owner sees every token; everyone else sees only their own.
  const scope = user.role === 'owner' ? undefined : eq(mcpTokens.userId, user.id)
  return db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      tokenPrefix: mcpTokens.tokenPrefix,
      createdAt: mcpTokens.createdAt,
      lastUsedAt: mcpTokens.lastUsedAt,
      expiresAt: mcpTokens.expiresAt,
      revokedAt: mcpTokens.revokedAt,
      userId: mcpTokens.userId,
    })
    .from(mcpTokens)
    .where(scope)
    .orderBy(desc(mcpTokens.createdAt))
}
