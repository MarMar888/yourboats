// Shared helpers for MCP tool handlers.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveActor, runWithActor, type Actor } from '../actor'
import { TOOL_REQUIRED_ROLES } from '../roles'

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** Wrap any JSON-serializable value as an MCP text result. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/** Wrap an error message as an MCP error result. */
export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }, null, 2) }], isError: true }
}

// While an exclusion set is active, matching tools are skipped at registration.
// The HTTP server uses this to hide financial/QBO tools in v1; set and cleared
// around the synchronous registration pass (see mcp/register.ts).
let excluded: Set<string> | null = null
export function setToolExclusions(names: Set<string> | null): void {
  excluded = names
}

/**
 * Register a tool whose handler returns a plain JSON-serializable value.
 *
 * On every call it (1) resolves the acting user — the per-request actor from an
 * authenticated HTTP token, or the stdio default — and opens an AsyncLocalStorage
 * scope so handlers can read getActorId(); (2) enforces the role matrix from
 * mcp/roles.ts; (3) catches thrown errors and surfaces them as structured error
 * results so a single failing tool never tears down the server.
 */
export function tool(
  server: McpServer,
  name: string,
  description: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<unknown>
): void {
  if (excluded?.has(name)) return
  const requiredRoles = TOOL_REQUIRED_ROLES[name]

  server.registerTool(
    name,
    { description, inputSchema },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any, extra: any) => {
      let actor: Actor
      try {
        // mcp-handler/withMcpAuth surfaces the verified token's AuthInfo here.
        actor = resolveActor(extra?.authInfo?.extra?.actor)
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err))
      }
      return runWithActor(actor, async () => {
        try {
          if (requiredRoles && !requiredRoles.includes(actor.role)) {
            return errorResult(
              `Forbidden: '${name}' requires role ${requiredRoles.join(' or ')} (you are ${actor.role}).`
            )
          }
          const result = await handler(args ?? {})
          return jsonResult(result)
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err))
        }
      })
    }
  )
}

/** YYYY-MM-DD validation regex shared across date params. */
export const YMD = /^\d{4}-\d{2}-\d{2}$/
