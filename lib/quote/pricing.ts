// Shared quote pricing math, imported by both the client wizard (for the
// live instant-quote preview) and the submit server action (which recomputes
// the price itself from the DB catalog rather than trusting the client, so a
// tampered price never reaches quote_requests). No server-only imports here.

export type BillingType = 'per_ft' | 'flat'

export type CatalogItem = {
  key: string
  name: string
  billingType: BillingType
  rate: number
  minPrice: number | null
}

export type QuoteLineItem = {
  key: string
  name: string
  price: number
}

export type QuoteInput = {
  lengthFt: number
  planType: 'recurring' | 'detail'
  recurringServiceKey: string | null
  detailServiceKeys: string[]
  addonKeys: string[]
}

export type QuoteResult = {
  lineItems: QuoteLineItem[]
  total: number
}

export function priceForItem(item: Pick<CatalogItem, 'billingType' | 'rate' | 'minPrice'>, lengthFt: number): number {
  const raw = item.billingType === 'per_ft' ? item.rate * lengthFt : item.rate
  const floored = item.minPrice != null ? Math.max(raw, item.minPrice) : raw
  return Math.round(floored * 100) / 100
}

export function computeQuote(
  input: QuoteInput,
  catalog: { services: CatalogItem[]; addons: CatalogItem[] }
): QuoteResult {
  const lengthFt = Math.max(0, input.lengthFt || 0)
  const lineItems: QuoteLineItem[] = []

  if (input.planType === 'recurring') {
    const plan = catalog.services.find((s) => s.key === input.recurringServiceKey)
    if (plan) lineItems.push({ key: plan.key, name: plan.name, price: priceForItem(plan, lengthFt) })
  } else {
    for (const key of input.detailServiceKeys) {
      const svc = catalog.services.find((s) => s.key === key)
      if (svc) lineItems.push({ key: svc.key, name: svc.name, price: priceForItem(svc, lengthFt) })
    }
    for (const key of input.addonKeys) {
      const addon = catalog.addons.find((a) => a.key === key)
      if (addon) lineItems.push({ key: addon.key, name: addon.name, price: priceForItem(addon, lengthFt) })
    }
  }

  const total = Math.round(lineItems.reduce((sum, li) => sum + li.price, 0) * 100) / 100
  return { lineItems, total }
}

/** True if any currently-selected service (recurring plan or detail services) is priced more precisely with boat photos. */
export function selectionNeedsPhotos(
  input: Pick<QuoteInput, 'planType' | 'recurringServiceKey' | 'detailServiceKeys'>,
  services: Array<{ key: string; requiresPhotos: boolean }>
): boolean {
  const selectedKeys =
    input.planType === 'recurring'
      ? [input.recurringServiceKey].filter((k): k is string => Boolean(k))
      : input.detailServiceKeys
  return selectedKeys.some((key) => services.find((s) => s.key === key)?.requiresPhotos)
}
