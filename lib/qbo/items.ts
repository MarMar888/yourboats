import { db } from '@/lib/db'
import { qboItems, qboTokens } from '@/lib/db/schema'
import { eq, notInArray } from 'drizzle-orm'
import { getQboClient } from './client'

type QboApiItem = {
  Id: string
  Name: string
  Description?: string
  UnitPrice?: number
  Active?: boolean
  Type?: string
}

/**
 * Sync all active service/non-group items from QBO into the qbo_items cache table.
 * Returns { synced } count, or { error } string if QBO is not connected.
 */
export async function syncQboItems(): Promise<{ synced: number } | { error: string }> {
  // Check QBO is connected before attempting
  const [tokens] = await db.select({ id: qboTokens.id }).from(qboTokens).where(eq(qboTokens.id, 1)).limit(1)
  if (!tokens) return { error: 'QuickBooks not connected.' }

  let items: QboApiItem[]
  try {
    const qbo = await getQboClient()
    const res = await new Promise<{ QueryResponse?: { Item?: QboApiItem[] } }>(
      (resolve, reject) =>
        qbo.findItems(
          [{ field: 'fetchAll', value: true }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, result: any) => (err ? reject(err) : resolve(result))
        )
    )
    // Exclude non-billable types: Category (folder/container) and Group (item bundles)
    items = (res.QueryResponse?.Item ?? []).filter(
      (i) => i.Active !== false && i.Type !== 'Group' && i.Type !== 'Category'
    )
  } catch (err) {
    return { error: `Failed to fetch items from QuickBooks: ${err instanceof Error ? err.message : String(err)}` }
  }

  const syncedIds = items.map((i) => i.Id)

  for (const item of items) {
    await db
      .insert(qboItems)
      .values({
        qboItemId: item.Id,
        name: item.Name,
        description: item.Description ?? null,
        unitPrice: item.UnitPrice != null ? String(item.UnitPrice) : null,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: qboItems.qboItemId,
        set: {
          name: item.Name,
          description: item.Description ?? null,
          unitPrice: item.UnitPrice != null ? String(item.UnitPrice) : null,
          syncedAt: new Date(),
        },
      })
  }

  // Purge any cached items that are no longer valid (e.g. previously synced Categories)
  if (syncedIds.length > 0) {
    await db.delete(qboItems).where(notInArray(qboItems.qboItemId, syncedIds))
  }

  return { synced: items.length }
}

/**
 * Return all cached QBO items, ordered by name.
 */
export async function getCachedQboItems() {
  return db.select().from(qboItems).orderBy(qboItems.name)
}

/**
 * Find the best matching QBO item for a service type string.
 * Now that serviceType is stored as the QBO item name directly, tries exact
 * match first, then partial, then generic fallback.
 */
export async function findBestQboItem(serviceType: string): Promise<{ id: string; name: string } | null> {
  const items = await getCachedQboItems()
  if (items.length === 0) return null

  const lower = serviceType.toLowerCase().replace(/_/g, ' ')
  // First try: exact case-insensitive match (serviceType IS the QBO item name for new services)
  const exact = items.find((i) => i.name.toLowerCase() === lower)
  // Second try: partial match on name
  const partial = items.find((i) => i.name.toLowerCase().includes(lower))
  // Third try: generic fallback
  const generic =
    items.find((i) => i.name.toLowerCase().includes('recurring')) ??
    items.find((i) => i.name.toLowerCase().includes('service'))

  const chosen = exact ?? partial ?? generic
  if (!chosen) return null
  return { id: chosen.qboItemId, name: chosen.name }
}
