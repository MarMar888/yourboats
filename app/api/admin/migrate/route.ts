import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

// One-off migration endpoint — creates the manual_payroll_lines table on production.
// Protected by a secret token. Will be deleted after use.
const MIGRATE_SECRET = 'mpl-migrate-2026-yourboats'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-migrate-token')
  if (token !== MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS manual_payroll_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        display_name text NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        description text NOT NULL,
        amount numeric(10, 2) NOT NULL,
        created_by_user_id text,
        created_at timestamp DEFAULT now() NOT NULL,
        approved_at timestamp,
        approved_by_user_id text,
        approved_by_name text
      )
    `)
    return NextResponse.json({ ok: true, message: 'manual_payroll_lines table created (or already existed)' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
