// One-off, SAFE, additive apply of the effective-dated rate changes.
//
// This ONLY creates `rate_changes` (if missing), seeds the baseline from the
// current rate tables, and inserts the dated changes. It NEVER drops anything
// and NEVER modifies `service_type_shares` / `tier_config` (the currently
// deployed code still reads those, so touching them would retroactively change
// historical payroll). The rate_changes rows are inert until the new
// date-aware code is deployed. Re-running is safe (idempotent).
//
//   npx tsx --env-file=.env.local scripts/apply-rate-changes.ts

import { db } from '@/lib/db'
import { rateChanges, serviceTypeShares, tierConfig } from '@/lib/db/schema'
import {
  getRateHistory,
  insertRateChange,
  resolveSharePctAsOf,
  resolveDeductionPctAsOf,
  type RateKind,
} from '@/lib/pay/rates'
import { sql } from 'drizzle-orm'

const CHANGES: Array<{ kind: RateKind; key: string; pct: number; effectiveFrom: string }> = [
  { kind: 'service_type_share', key: 'recurring', pct: 62.5, effectiveFrom: '2026-06-24' },
  { kind: 'service_type_share', key: 'Recurring Services', pct: 62.5, effectiveFrom: '2026-06-24' },
  { kind: 'service_type_share', key: 'detailing', pct: 62.5, effectiveFrom: '2026-07-14' },
  { kind: 'service_type_share', key: 'Detailing Services', pct: 62.5, effectiveFrom: '2026-07-14' },
  { kind: 'tier_deduction', key: 'mid', pct: 2.5, effectiveFrom: '2026-06-24' },
]

async function main() {
  // 0. Show the current values that will become the "from the beginning" baseline.
  const curShares = await db.select().from(serviceTypeShares)
  const curTiers = await db.select().from(tierConfig)
  console.log('Current service_type_shares (become baseline):')
  for (const r of curShares) console.log(`  ${r.serviceType} = ${r.employeeSharePct}`)
  console.log('Current tier_config (become baseline):')
  for (const r of curTiers) console.log(`  ${r.tier} = ${r.deductionPct}`)

  // 1. Create table + unique index (additive, never drops).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "rate_changes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "kind" text NOT NULL,
      "key" text NOT NULL,
      "pct" numeric(5,2) NOT NULL,
      "effective_from" date NOT NULL,
      "note" text,
      "created_by_user_id" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )`)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "rate_changes_kind_key_from_uniq"
      ON "rate_changes" ("kind", "key", "effective_from")`)

  // 2. Baseline: snapshot every current rate as effective from 2000-01-01.
  await db.execute(sql`
    INSERT INTO "rate_changes" ("kind", "key", "pct", "effective_from", "note")
    SELECT 'service_type_share', "service_type", "employee_share_pct", '2000-01-01', 'baseline import'
    FROM "service_type_shares"
    ON CONFLICT ("kind", "key", "effective_from") DO NOTHING`)
  await db.execute(sql`
    INSERT INTO "rate_changes" ("kind", "key", "pct", "effective_from", "note")
    SELECT 'tier_deduction', "tier", "deduction_pct", '2000-01-01', 'baseline import'
    FROM "tier_config"
    ON CONFLICT ("kind", "key", "effective_from") DO NOTHING`)

  // 3. The dated changes.
  for (const c of CHANGES) {
    await insertRateChange({ ...c, note: '2026-07 rate change' })
  }

  // 4. Verify: dump rows + resolved values on either side of each effective date.
  const rows = await db
    .select()
    .from(rateChanges)
    .orderBy(rateChanges.kind, rateChanges.key, rateChanges.effectiveFrom)
  console.log(`\nrate_changes now has ${rows.length} rows:`)
  for (const r of rows) console.log(`  ${r.kind}  ${r.key}  ${r.pct}  eff ${r.effectiveFrom}`)

  const h = await getRateHistory()
  console.log('\nResolved rates as of key dates:')
  for (const d of ['2026-06-23', '2026-06-24', '2026-07-13', '2026-07-14']) {
    console.log(
      `  ${d}: recurring=${resolveSharePctAsOf(h, 'recurring', d)}  detailing=${resolveSharePctAsOf(h, 'detailing', d)}  mid_deduction=${resolveDeductionPctAsOf(h, 'mid', d)}`
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
