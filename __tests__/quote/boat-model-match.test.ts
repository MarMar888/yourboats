import { describe, expect, it } from 'vitest'
import { rankBoatModels, suggestionFromCatalogRow, type BoatModelRow } from '@/lib/quote/boat-model-match'

const ROWS: BoatModelRow[] = [
  { id: '1', make: 'Sea Ray', model: 'Sundancer 320', boatTypeKey: 'express_cruiser', lengthFt: 32, active: true },
  { id: '2', make: 'Sea Ray', model: 'Sundancer 260', boatTypeKey: 'express_cruiser', lengthFt: 26, active: true },
  { id: '3', make: 'Boston Whaler', model: '210 Montauk', boatTypeKey: 'center_console', lengthFt: 21, active: true },
  { id: '4', make: 'Bennington', model: '24 QXFB', boatTypeKey: 'pontoon', lengthFt: 24, active: false },
]

describe('rankBoatModels', () => {
  it('returns nothing for a too-short query', () => {
    expect(rankBoatModels('s', ROWS)).toEqual([])
  })

  it('matches make and model text regardless of order', () => {
    const result = rankBoatModels('sundancer 320', ROWS)
    expect(result.map((r) => r.id)).toEqual(['1'])
  })

  it('matches on make alone and ranks multiple results', () => {
    const result = rankBoatModels('sea ray', ROWS)
    expect(result.map((r) => r.id).sort()).toEqual(['1', '2'])
  })

  it('is case-insensitive', () => {
    expect(rankBoatModels('BOSTON WHALER', ROWS).map((r) => r.id)).toEqual(['3'])
  })

  it('excludes inactive rows', () => {
    expect(rankBoatModels('bennington', ROWS)).toEqual([])
  })

  it('requires every term to appear somewhere in make+model', () => {
    expect(rankBoatModels('sundancer whaler', ROWS)).toEqual([])
  })

  it('ranks a prefix match above a mid-string match', () => {
    const rows: BoatModelRow[] = [
      { id: 'a', make: 'X Boats', model: 'Whaler Edition', boatTypeKey: 'bowrider', lengthFt: 20, active: true },
      { id: 'b', make: 'Whaler Co', model: 'Classic', boatTypeKey: 'bowrider', lengthFt: 20, active: true },
    ]
    expect(rankBoatModels('whaler', rows).map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('suggestionFromCatalogRow', () => {
  it('maps a catalog row to a catalog-sourced suggestion', () => {
    expect(suggestionFromCatalogRow(ROWS[0])).toEqual({
      id: '1',
      make: 'Sea Ray',
      model: 'Sundancer 320',
      boatTypeKey: 'express_cruiser',
      lengthFt: 32,
      source: 'catalog',
    })
  })
})
