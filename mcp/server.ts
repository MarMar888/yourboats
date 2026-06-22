// Florence MCP server — lets an AI assistant drive yourboats / Squeaky Clean Boats
// operations (scheduling, completions, invoicing, complaints, payroll) directly
// against the database, without the web UI. All actions run as the owner user.
//
// Run with:  pnpm mcp        (tsx --env-file=.env.local mcp/server.ts)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { getOwner } from './owner'
import { registerScheduleTools } from './tools/schedule'
import { registerServiceTools } from './tools/services'
import { registerCustomerTools } from './tools/customers'
import { registerInvoiceTools } from './tools/invoices'
import { registerComplaintTools } from './tools/complaints'
import { registerPayTools } from './tools/pay'

async function main() {
  // Resolve the owner up-front so any misconfiguration fails loudly at startup
  // rather than on the first tool call.
  const owner = await getOwner()
  // stderr so it doesn't corrupt the stdio JSON-RPC stream on stdout.
  console.error(`[mcp] Acting as owner: ${owner.displayName} <${owner.email}> (${owner.id})`)

  const server = new McpServer({ name: 'yourboats-florence', version: '1.0.0' })

  registerScheduleTools(server)
  registerServiceTools(server)
  registerCustomerTools(server)
  registerInvoiceTools(server)
  registerComplaintTools(server)
  registerPayTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[mcp] Florence MCP server started')
}

main().catch((err) => {
  console.error('[mcp] Fatal startup error:', err)
  process.exit(1)
})
