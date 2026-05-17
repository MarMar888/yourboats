import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

// `neon()` throws if the URL is missing. `next build` runs without `.env` locally and
// analyzes modules that import `db` — use a placeholder so the bundle can load. Runtime
// must set `DATABASE_URL` (e.g. Vercel env) for real queries.
const connectionString =
  process.env.DATABASE_URL?.trim() ||
  'postgresql://127.0.0.1:5432/postgres'

const sql = neon(connectionString)
export const db = drizzle(sql, { schema })
