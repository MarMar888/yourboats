// Re-export the app's Drizzle client and schema for the MCP server.
// The MCP server connects directly to Neon Postgres (same DATABASE_URL the app
// uses) and bypasses Next.js entirely — no HTTP round-trip, works offline.
import * as schema from '../lib/db/schema'

export { db } from '../lib/db'
export { schema }
