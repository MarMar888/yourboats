import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteAddons, quoteServices } from '@/lib/db/schema'
import type { BillingType } from './pricing'

export type QuoteServiceItem = {
  key: string
  category: 'recurring' | 'detail'
  name: string
  description: string | null
  billingType: BillingType
  rate: number
  minPrice: number | null
  requiresPhotos: boolean
}

export type QuoteAddonItem = {
  key: string
  name: string
  description: string | null
  billingType: BillingType
  rate: number
  minPrice: number | null
  requiresAttribute: string | null
}

export type QuoteCatalog = {
  services: QuoteServiceItem[]
  addons: QuoteAddonItem[]
}

/** Active catalog rows, ordered for display. Used by both the public wizard and the submit action's authoritative price recompute. */
export async function getQuoteCatalog(): Promise<QuoteCatalog> {
  const [services, addons] = await Promise.all([
    db.select().from(quoteServices).where(eq(quoteServices.active, true)).orderBy(asc(quoteServices.sortOrder)),
    db.select().from(quoteAddons).where(eq(quoteAddons.active, true)).orderBy(asc(quoteAddons.sortOrder)),
  ])

  return {
    services: services.map((s) => ({
      key: s.key,
      category: s.category as 'recurring' | 'detail',
      name: s.name,
      description: s.description,
      billingType: s.billingType as BillingType,
      rate: Number(s.rate),
      minPrice: s.minPrice != null ? Number(s.minPrice) : null,
      requiresPhotos: s.requiresPhotos,
    })),
    addons: addons.map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      billingType: a.billingType as BillingType,
      rate: Number(a.rate),
      minPrice: a.minPrice != null ? Number(a.minPrice) : null,
      requiresAttribute: a.requiresAttribute,
    })),
  }
}
