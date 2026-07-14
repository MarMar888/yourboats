import { db } from '@/lib/db'
import { rateChanges } from '@/lib/db/schema'

// Effective-dated pay rates.
//
// Both the crew-pool share (per service type) and the tier deduction can change
// over time. Every value — including the original baseline — is stored as a row
// in `rate_changes` with an `effectiveFrom` date. To find the rate that applied
// to a given service, take the row with the greatest `effectiveFrom` that is on
// or before that service's date. This keeps historical payroll correct when a
// rate changes: only services on/after the effective date pick up the new value.

export const DEFAULT_SERVICE_TYPE_SHARE = 50
export const DEFAULT_TIER_DEDUCTION = 0

export type RateKind = 'service_type_share' | 'tier_deduction'

export type RateChangeRow = {
  kind: RateKind
  key: string          // service type name, or employee tier ('top' | 'mid' | 'low')
  pct: number
  effectiveFrom: string // YYYY-MM-DD
}

/**
 * Fetch the full effective-dated rate history (shares + tier deductions).
 * Call once per request, then resolve per service with resolve*AsOf().
 */
export async function getRateHistory(): Promise<RateChangeRow[]> {
  const rows = await db.select().from(rateChanges)
  return rows.map((r) => ({
    kind: r.kind as RateKind,
    key: r.key,
    pct: Number(r.pct),
    effectiveFrom: r.effectiveFrom,
  }))
}

/**
 * Resolve the rate for (kind, key) in effect on `asOfDate`: the row with the
 * greatest `effectiveFrom` that is <= asOfDate. Returns `fallback` when no dated
 * row applies. Dates are YYYY-MM-DD strings, so lexical comparison is chronological.
 */
export function resolveRateAsOf(
  history: RateChangeRow[],
  kind: RateKind,
  key: string,
  asOfDate: string,
  fallback: number
): number {
  let best: RateChangeRow | undefined
  for (const r of history) {
    if (r.kind !== kind || r.key !== key) continue
    if (r.effectiveFrom <= asOfDate && (!best || r.effectiveFrom > best.effectiveFrom)) {
      best = r
    }
  }
  return best ? best.pct : fallback
}

export function resolveSharePctAsOf(
  history: RateChangeRow[],
  serviceType: string,
  asOfDate: string
): number {
  return resolveRateAsOf(history, 'service_type_share', serviceType, asOfDate, DEFAULT_SERVICE_TYPE_SHARE)
}

export function resolveDeductionPctAsOf(
  history: RateChangeRow[],
  tier: string,
  asOfDate: string
): number {
  return resolveRateAsOf(history, 'tier_deduction', tier, asOfDate, DEFAULT_TIER_DEDUCTION)
}

/**
 * Insert (or overwrite) a dated rate row. Idempotent on (kind, key, effectiveFrom):
 * re-setting the same effective date updates the percentage.
 */
export async function insertRateChange(params: {
  kind: RateKind
  key: string
  pct: number
  effectiveFrom: string
  note?: string | null
  createdByUserId?: string | null
}): Promise<void> {
  await db
    .insert(rateChanges)
    .values({
      kind: params.kind,
      key: params.key,
      pct: String(params.pct),
      effectiveFrom: params.effectiveFrom,
      note: params.note ?? null,
      createdByUserId: params.createdByUserId ?? null,
    })
    .onConflictDoUpdate({
      target: [rateChanges.kind, rateChanges.key, rateChanges.effectiveFrom],
      set: { pct: String(params.pct), note: params.note ?? null, createdByUserId: params.createdByUserId ?? null },
    })
}
