import { describe, expect, it } from 'vitest'
import { computeQuote, priceForItem, selectionNeedsPhotos } from '@/lib/quote/pricing'

const CATALOG = {
  services: [
    { key: 'recurring_weekly', name: 'Weekly Wash', billingType: 'per_ft' as const, rate: 3.5, minPrice: 65 },
    { key: 'detail_full', name: 'Full Detail', billingType: 'per_ft' as const, rate: 12, minPrice: 220 },
    { key: 'powerwashing', name: 'Powerwashing', billingType: 'per_ft' as const, rate: 2.5, minPrice: 90 },
  ],
  addons: [
    { key: 'addon_cabin_interior', name: 'Cabin Interior Detail', billingType: 'flat' as const, rate: 85, minPrice: null },
    { key: 'addon_carpet_shampoo', name: 'Carpet Shampoo', billingType: 'flat' as const, rate: 65, minPrice: null },
    { key: 'addon_bilge', name: 'Bilge Cleaning', billingType: 'per_hour' as const, rate: 60, minPrice: null },
  ],
}

describe('priceForItem', () => {
  it('multiplies rate by length for per_ft billing', () => {
    expect(priceForItem({ billingType: 'per_ft', rate: 3.5, minPrice: null }, 24)).toBe(84)
  })

  it('uses the flat rate as-is', () => {
    expect(priceForItem({ billingType: 'flat', rate: 85, minPrice: null }, 24)).toBe(85)
  })

  it('floors per_ft pricing at minPrice for small boats', () => {
    expect(priceForItem({ billingType: 'per_ft', rate: 3.5, minPrice: 65 }, 10)).toBe(65)
  })

  it('does not apply the floor once the boat is long enough', () => {
    expect(priceForItem({ billingType: 'per_ft', rate: 3.5, minPrice: 65 }, 30)).toBe(105)
  })

  it('bills per_hour at the flat rate for a single assumed hour', () => {
    expect(priceForItem({ billingType: 'per_hour', rate: 60, minPrice: null }, 24)).toBe(60)
  })
})

describe('computeQuote', () => {
  it('prices a recurring plan as a single line item', () => {
    const result = computeQuote(
      { lengthFt: 24, planType: 'recurring', recurringServiceKey: 'recurring_weekly', detailServiceKeys: [], addonKeys: [] },
      CATALOG
    )
    expect(result.lineItems).toEqual([{ key: 'recurring_weekly', name: 'Weekly Wash', price: 84 }])
    expect(result.total).toBe(84)
  })

  it('adds selected add-ons on top of a recurring plan', () => {
    const result = computeQuote(
      {
        lengthFt: 24,
        planType: 'recurring',
        recurringServiceKey: 'recurring_weekly',
        detailServiceKeys: [],
        addonKeys: ['addon_cabin_interior', 'addon_bilge'],
      },
      CATALOG
    )
    // recurring_weekly: 24*3.5=84, cabin: 85 flat, bilge: 60 per_hour (1hr baseline)
    expect(result.total).toBe(84 + 85 + 60)
    expect(result.lineItems).toHaveLength(3)
  })

  it('sums selected detail services and add-ons', () => {
    const result = computeQuote(
      {
        lengthFt: 25,
        planType: 'detail',
        recurringServiceKey: null,
        detailServiceKeys: ['detail_full', 'powerwashing'],
        addonKeys: ['addon_cabin_interior', 'addon_carpet_shampoo'],
      },
      CATALOG
    )
    // detail_full: 25*12=300, powerwashing: 25*2.5=62.5 floored to its $90 minimum, addons: 85+65
    expect(result.total).toBe(300 + 90 + 85 + 65)
    expect(result.lineItems).toHaveLength(4)
  })

  it('ignores unknown catalog keys instead of throwing', () => {
    const result = computeQuote(
      { lengthFt: 20, planType: 'detail', recurringServiceKey: null, detailServiceKeys: ['not_a_real_service'], addonKeys: [] },
      CATALOG
    )
    expect(result.lineItems).toEqual([])
    expect(result.total).toBe(0)
  })

  it('produces nothing for a recurring plan with no plan selected', () => {
    const result = computeQuote(
      { lengthFt: 20, planType: 'recurring', recurringServiceKey: null, detailServiceKeys: [], addonKeys: [] },
      CATALOG
    )
    expect(result.total).toBe(0)
  })
})

describe('selectionNeedsPhotos', () => {
  const services = [
    { key: 'detail_full', requiresPhotos: false },
    { key: 'buffing_waxing', requiresPhotos: true },
    { key: 'acid_washing', requiresPhotos: true },
    { key: 'recurring_weekly', requiresPhotos: false },
  ]

  it('is false when no selected detail service requires photos', () => {
    expect(
      selectionNeedsPhotos(
        { planType: 'detail', recurringServiceKey: null, detailServiceKeys: ['detail_full'] },
        services
      )
    ).toBe(false)
  })

  it('is true when any selected detail service requires photos', () => {
    expect(
      selectionNeedsPhotos(
        { planType: 'detail', recurringServiceKey: null, detailServiceKeys: ['detail_full', 'buffing_waxing'] },
        services
      )
    ).toBe(true)
  })

  it('checks the recurring plan when planType is recurring', () => {
    expect(
      selectionNeedsPhotos(
        { planType: 'recurring', recurringServiceKey: 'recurring_weekly', detailServiceKeys: ['buffing_waxing'] },
        services
      )
    ).toBe(false)
  })

  it('ignores unknown keys instead of throwing', () => {
    expect(
      selectionNeedsPhotos(
        { planType: 'detail', recurringServiceKey: null, detailServiceKeys: ['not_a_real_service'] },
        services
      )
    ).toBe(false)
  })
})
