// Shared helpers for MCP tool handlers.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

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

/**
 * Register a tool whose handler returns a plain JSON-serializable value.
 * Catches thrown errors and surfaces them as structured error results so a single
 * failing tool never tears down the server.
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
  server.registerTool(
    name,
    { description, inputSchema },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      try {
        const result = await handler(args ?? {})
        return jsonResult(result)
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err))
      }
    }
  )
}

/** YYYY-MM-DD validation regex shared across date params. */
export const YMD = /^\d{4}-\d{2}-\d{2}$/
