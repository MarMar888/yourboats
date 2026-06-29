// Bearer-token verifier for the remote HTTP MCP server (used by withMcpAuth).
//
// Looks up the SHA-256 hash of the presented Personal Access Token in mcp_tokens,
// joins the owning user, and rejects revoked/expired tokens or inactive users.
// On success it returns an AuthInfo whose `extra.actor` carries the resolved
// user — the tool() wrapper opens an AsyncLocalStorage scope from it so every
// write is attributed to the real user with their current role.
import { eq } from 'drizzle-orm'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { db } from '@/lib/db'
import { mcpTokens, users } from '@/lib/db/schema'
import { hashToken } from '@/lib/mcp/hash-token'
import type { Actor } from '@/mcp/actor'

export async function verifyMcpToken(
  _req: Request,
  bearer?: string
): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined

  const [row] = await db
    .select({
      id: mcpTokens.id,
      userId: mcpTokens.userId,
      revokedAt: mcpTokens.revokedAt,
      expiresAt: mcpTokens.expiresAt,
      displayName: users.displayName,
      role: users.role,
      email: users.email,
      active: users.active,
    })
    .from(mcpTokens)
    .innerJoin(users, eq(users.id, mcpTokens.userId))
    .where(eq(mcpTokens.tokenHash, hashToken(bearer)))
    .limit(1)

  if (!row || row.revokedAt || !row.active) return undefined
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return undefined

  // Best-effort last-used bump; never block auth on it.
  void db
    .update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, row.id))
    .catch(() => {})

  const actor: Actor = {
    userId: row.userId,
    role: row.role,
    displayName: row.displayName,
    email: row.email,
    via: 'mcp-http',
  }

  return {
    token: bearer,
    clientId: `mcp-token:${row.id}`,
    scopes: [`role:${row.role}`],
    extra: { actor },
  }
}
