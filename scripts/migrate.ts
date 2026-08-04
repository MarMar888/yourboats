/**
 * Applies pending SQL migrations from `drizzle/` in order, tracking what has
 * already run in a `_migrations` table so each file is applied exactly once.
 *
 * This runs automatically in the Vercel build (see `vercel.json` `buildCommand`),
 * BEFORE the new deployment starts serving traffic. That closes the race where
 * new code queries a table that its migration hasn't created yet. It can also be
 * run by hand locally:
 *
 *   pnpm db:migrate                 # uses process env (e.g. exported DATABASE_URL)
 *   pnpm tsx --env-file=.env.local scripts/migrate.ts   # local, from .env.local
 *
 * We use the `postgres` (postgres-js) driver rather than the app's neon-http
 * driver because migration files contain multiple statements and a data backfill
 * that must run inside a single transaction — things the HTTP driver can't do.
 *
 * Every migration is written to be idempotent (DDL uses `IF NOT EXISTS`, data
 * backfills guard against duplicates), so applying them against a database that
 * was previously migrated by hand is a safe no-op that just records the tracking
 * rows. New migrations added later run exactly once, in filename order.
 */

import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle')

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    // Mirrors lib/db/index.ts: a build without a database URL shouldn't fail.
    // Runtime (Vercel) always sets DATABASE_URL, so real deploys still migrate.
    console.warn('[migrate] DATABASE_URL not set — skipping migrations.')
    return
  }

  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:\/]/.test(url)
  const sql = postgres(url, {
    max: 1,
    ssl: isLocal ? false : 'require',
    onnotice: () => {},
  })

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        "name" text PRIMARY KEY,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      )
    `

    const appliedRows = await sql<{ name: string }[]>`SELECT "name" FROM "_migrations"`
    const applied = new Set(appliedRows.map((r) => r.name))

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const pending = files.filter((f) => !applied.has(f))
    if (pending.length === 0) {
      console.log('[migrate] Up to date — no pending migrations.')
      return
    }

    console.log(`[migrate] ${pending.length} pending migration(s): ${pending.join(', ')}`)

    for (const file of pending) {
      const contents = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`[migrate] Applying ${file}...`)
      // Each file + its tracking row commit together, so a crash mid-file
      // never leaves a migration half-applied or falsely marked as done.
      await sql.begin(async (tx) => {
        await tx.unsafe(contents)
        await tx`INSERT INTO "_migrations" ("name") VALUES (${file})`
      })
    }

    console.log(`[migrate] Done — applied ${pending.length} migration(s).`)
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error('[migrate] Migration failed:', err)
  process.exit(1)
})
