// Florence MCP server (stdio) — lets an AI assistant drive yourboats / Squeaky
// Clean Boats operations (scheduling, completions, invoicing, complaints, payroll)
// directly against the database, without the web UI. Every stdio action runs as
// the owner user (see setDefaultActor below). The remote, per-user-authenticated
// HTTP server lives at app/api/[transport]/route.ts.
//
// Run with:  pnpm mcp        (tsx --env-file=.env.local mcp/server.ts)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { getOwner } from './owner'
import { registerAllTools } from './register'
import { setDefaultActor } from './actor'

async function main() {
  // Resolve the owner up-front so any misconfiguration fails loudly at startup
  // rather than on the first tool call.
  const owner = await getOwner()
  // stderr so it doesn't corrupt the stdio JSON-RPC stream on stdout.
  console.error(`[mcp] Acting as owner: ${owner.displayName} <${owner.email}> (${owner.id})`)

  // Every stdio tool call is attributed to the owner (this transport has no
  // per-request auth). The HTTP transport never sets a default actor.
  setDefaultActor({
    userId: owner.id,
    role: 'owner',
    displayName: owner.displayName,
    email: owner.email,
    via: 'mcp',
  })

  const server = new McpServer({ name: 'yourboats-florence', version: '1.0.0' })
  registerAllTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[mcp] Florence MCP server started')
}

main().catch((err) => {
  console.error('[mcp] Fatal startup error:', err)
  process.exit(1)
})
