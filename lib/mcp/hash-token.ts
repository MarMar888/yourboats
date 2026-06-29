import { createHash } from 'node:crypto'

/**
 * Hash an MCP Personal Access Token for storage and lookup.
 *
 * Single source of truth shared by token minting (settings/mcp-token-actions)
 * and verification (lib/mcp/verify-token), so the two can never drift — if this
 * changed in only one place, newly minted tokens would fail auth.
 *
 * SHA-256 is correct here (the token is a full-entropy random secret, not a
 * password); the optional pepper adds defense-in-depth without breaking the
 * indexed lookup.
 */
export function hashToken(raw: string): string {
  const pepper = process.env.MCP_TOKEN_PEPPER ?? ''
  return createHash('sha256').update(pepper + raw).digest('hex')
}
