// Shared tool registration so the stdio server (mcp/server.ts) and the remote
// HTTP route (app/api/[transport]/route.ts) expose the same tools from one
// definition. The HTTP server passes an `exclude` set to hide financial/QBO
// tools in v1.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { setToolExclusions } from './tools/_util'
import { registerScheduleTools } from './tools/schedule'
import { registerServiceTools } from './tools/services'
import { registerCustomerTools } from './tools/customers'
import { registerInvoiceTools } from './tools/invoices'
import { registerComplaintTools } from './tools/complaints'
import { registerPayTools } from './tools/pay'

// Tools excluded from the remote HTTP server in v1: each pushes to QuickBooks or
// emails a customer. They remain available on the local stdio server.
export const V1_EXCLUDE = new Set<string>([
  'void_invoice',
  'create_qbo_invoice',
  'sync_invoice_to_qbo',
  'send_invoice',
  'cancel_service', // voids the linked invoice (incl. in QBO)
])

export function registerAllTools(server: McpServer, opts?: { exclude?: Set<string> }): void {
  setToolExclusions(opts?.exclude ?? null)
  try {
    registerScheduleTools(server)
    registerServiceTools(server)
    registerCustomerTools(server)
    registerInvoiceTools(server)
    registerComplaintTools(server)
    registerPayTools(server)
  } finally {
    setToolExclusions(null)
  }
}
