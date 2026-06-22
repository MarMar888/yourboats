// Lean audit logger for the MCP server. Mirrors lib/log.ts but takes an explicit
// userId instead of calling getCurrentUser() (which relies on Next.js cookies()).
// Every entry is tagged `_via: 'mcp'` so MCP-initiated actions are distinguishable
// in the logs table. Never throws — logging must not crash a tool call.
import { db } from '../lib/db'
import { logs } from '../lib/db/schema'

type McpLogEntry = {
  userId: string
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  error?: string
}

export async function mcpLog(entry: McpLogEntry): Promise<void> {
  try {
    await db.insert(logs).values({
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: JSON.stringify({ ...entry.metadata, _via: 'mcp' }),
      error: entry.error ?? null,
    })
  } catch {
    // Logging must never crash the caller.
  }
}
