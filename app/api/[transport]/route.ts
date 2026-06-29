// Remote HTTP MCP server for Florence, hosted on Vercel.
//
// Serves the same tools as the local stdio server (mcp/server.ts) over Streamable
// HTTP at /api/mcp, authenticated per-user via Personal Access Tokens. In v1 the
// financial/QBO/email tools are excluded (V1_EXCLUDE); role gates are enforced in
// the shared tool() wrapper. The endpoint 404s unless MCP_HTTP_ENABLED is set.
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { registerAllTools, V1_EXCLUDE } from '@/mcp/register'
import { verifyMcpToken } from '@/lib/mcp/verify-token'

// node-quickbooks / nodemailer / async_hooks need the Node.js runtime (not Edge).
export const runtime = 'nodejs'
export const maxDuration = 60

const handler = createMcpHandler(
  (server) => {
    registerAllTools(server, { exclude: V1_EXCLUDE })
  },
  { serverInfo: { name: 'yourboats-florence', version: '1.0.0' } },
  // basePath '/api' → Streamable HTTP endpoint is /api/mcp. SSE disabled so we
  // stay stateless (no Redis required) on Vercel.
  { basePath: '/api', maxDuration: 60, disableSse: true }
)

const authed = withMcpAuth(handler, verifyMcpToken, { required: true })

// Master kill switch: the endpoint is invisible (404) unless explicitly enabled.
function guarded(req: Request): Promise<Response> | Response {
  if (process.env.MCP_HTTP_ENABLED !== 'true') {
    return new Response('Not Found', { status: 404 })
  }
  return authed(req)
}

export { guarded as GET, guarded as POST, guarded as DELETE }
