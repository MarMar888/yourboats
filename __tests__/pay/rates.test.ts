import { describe, it, expect, vi } from 'vitest'

// rates.ts imports the db client at module load; we only exercise the pure
// resolvers here, so a stub is enough.
vi.mock('@/lib/db', () => ({ db: {} }))

import {
  resolveRateAsOf,
  resolveSharePctAsOf,
  resolveDeductionPctAsOf,
  type RateChangeRow,
} from '@/lib/pay/rates'

// The exact rate changes being applied: recurring & detailing → 62.5%, and the
// mid-tier deduction → 2.5%, each on its own effective date, over the baseline.
const history: RateChangeRow[] = [
  { kind: 'service_type_share', key: 'recurring', pct: 55, effectiveFrom: '2000-01-01' },
  { kind: 'service_type_share', key: 'recurring', pct: 62.5, effectiveFrom: '2026-06-24' },
  { kind: 'service_type_share', key: 'detailing', pct: 50, effectiveFrom: '2000-01-01' },
  { kind: 'service_type_share', key: 'detailing', pct: 62.5, effectiveFrom: '2026-07-14' },
  { kind: 'tier_deduction', key: 'mid', pct: 7.5, effectiveFrom: '2000-01-01' },
  { kind: 'tier_deduction', key: 'mid', pct: 2.5, effectiveFrom: '2026-06-24' },
]

describe('effective-dated rate resolution', () => {
  it('recurring share steps up on 2026-06-24 (boundary inclusive)', () => {
    expect(resolveSharePctAsOf(history, 'recurring', '2026-06-23')).toBe(55)
    expect(resolveSharePctAsOf(history, 'recurring', '2026-06-24')).toBe(62.5)
    expect(resolveSharePctAsOf(history, 'recurring', '2026-07-13')).toBe(62.5)
  })

  it('detailing share only changes on/after 2026-07-14', () => {
    expect(resolveSharePctAsOf(history, 'detailing', '2026-07-13')).toBe(50)
    expect(resolveSharePctAsOf(history, 'detailing', '2026-07-14')).toBe(62.5)
  })

  it('mid-tier deduction drops from 7.5 to 2.5 on 2026-06-24', () => {
    expect(resolveDeductionPctAsOf(history, 'mid', '2026-06-23')).toBe(7.5)
    expect(resolveDeductionPctAsOf(history, 'mid', '2026-06-24')).toBe(2.5)
  })

  it('falls back when no dated row applies', () => {
    expect(resolveSharePctAsOf(history, 'unknown_type', '2026-07-01')).toBe(50) // DEFAULT_SERVICE_TYPE_SHARE
    expect(resolveDeductionPctAsOf(history, 'top', '2026-07-01')).toBe(0) // no rows for 'top' tier
    expect(resolveRateAsOf(history, 'service_type_share', 'recurring', '1999-12-31', 99)).toBe(99)
  })
})
