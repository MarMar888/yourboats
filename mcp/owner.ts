// Resolves the "owner" user the MCP server acts as. All mutations are attributed
// to this user (the app has no request/cookie context here). Prefer an explicit
// MCP_OWNER_USER_ID env var; otherwise fall back to the first owner-role user.
import { eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'

let cached: { id: string; displayName: string; email: string } | null = null

export async function getOwner(): Promise<{ id: string; displayName: string; email: string }> {
  if (cached) return cached

  const envId = process.env.MCP_OWNER_USER_ID?.trim()
  if (envId) {
    const [u] = await db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, envId))
      .limit(1)
    if (!u) throw new Error(`MCP_OWNER_USER_ID ${envId} not found in users table.`)
    cached = u
    return u
  }

  const [u] = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.role, 'owner'))
    .limit(1)
  if (!u) {
    throw new Error(
      'No owner-role user found in the database. Set MCP_OWNER_USER_ID in .env.local.'
    )
  }
  cached = u
  return u
}

export async function getOwnerId(): Promise<string> {
  return (await getOwner()).id
}
