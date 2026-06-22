# Florence MCP Server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that lets
an AI assistant (Claude Code / Claude Desktop) drive yourboats / Squeaky Clean Boats
operations directly — scheduling, completions, invoicing, complaints, payroll —
**without using the web UI**.

It connects straight to the same Neon Postgres database the app uses (via
`DATABASE_URL`), through Drizzle, and applies the same business logic as the app's
server actions (auto-invoicing, payroll refresh, QBO sync). No Next.js, no HTTP
round-trip — it works locally even when the app isn't running.

## Running it

```bash
pnpm mcp        # start the server (stdio)
pnpm mcp:dev    # auto-restart on file changes
```

The server reads `.env.local` (same vars as the app). All actions are attributed to
the **owner** user — set `MCP_OWNER_USER_ID` to pin a specific user, or leave it
blank to auto-detect the first `role='owner'` user.

## Claude Code

`.mcp.json` at the repo root registers this server as `florence`. Claude Code
discovers it automatically — approve it when prompted on the next session.

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "florence": {
      "command": "pnpm",
      "args": ["--prefix", "/Users/marleybarrett/conductor/workspaces/yourboats/florence", "mcp"]
    }
  }
}
```

## Tools (25)

**Schedule** — `list_services`, `get_service`, `mark_complete`, `mark_incomplete`,
`reschedule_service`, `cancel_service`, `approve_week`

**Services** — `create_service`, `create_recurring_schedule`, `add_tip`

**Customers & boats** — `list_customers`, `get_customer`, `create_customer`,
`update_customer`, `create_boat`, `update_boat`

**Invoices** — `list_invoices`, `create_qbo_invoice`, `sync_invoice_to_qbo`,
`send_invoice`, `void_invoice`

**Complaints** — `list_complaints`, `create_complaint`, `resolve_complaint`

**Pay** — `get_pay_period_summary` (read-only; payroll approval stays in the UI)

## Notes

- Customer/boat/service writes mirror the app's server actions exactly, minus the
  Next.js `revalidatePath`/`redirect` calls.
- QBO tools fail gracefully (`{ ok: false, error: 'QuickBooks not connected.' }`)
  when no QBO tokens are stored.
- Every action is written to the `logs` table tagged `_via: 'mcp'`.
- Each tool returns a structured `{ ok, ... }` JSON object for predictable consumption.
