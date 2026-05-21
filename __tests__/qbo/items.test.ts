import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB module so tests don't need a real database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

// We import after mocking so the module picks up the mock
import { findBestQboItem } from '@/lib/qbo/items'
import { db } from '@/lib/db'

const mockItems = [
  { qboItemId: 'item-1', name: 'Acid Washing', description: null, unitPrice: null, syncedAt: new Date() },
  { qboItemId: 'item-2', name: 'Recurring Clean', description: null, unitPrice: null, syncedAt: new Date() },
  { qboItemId: 'item-3', name: 'Detailing Service', description: null, unitPrice: null, syncedAt: new Date() },
]

function mockDbSelect(items: typeof mockItems) {
  // Drizzle's select() returns a chainable builder
  const chain = {
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(items),
  }
  ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findBestQboItem', () => {
  it('returns null when cache is empty', async () => {
    mockDbSelect([])
    const result = await findBestQboItem('recurring')
    expect(result).toBeNull()
  })

  it('returns exact match (case-insensitive)', async () => {
    mockDbSelect(mockItems)
    const result = await findBestQboItem('Acid Washing')
    expect(result).toEqual({ id: 'item-1', name: 'Acid Washing' })
  })

  it('returns partial match when no exact match', async () => {
    mockDbSelect(mockItems)
    // "detailing" is a partial match on "Detailing Service"
    const result = await findBestQboItem('detailing')
    expect(result).toEqual({ id: 'item-3', name: 'Detailing Service' })
  })

  it('returns generic fallback when no exact or partial match', async () => {
    mockDbSelect(mockItems)
    // "recurring" hits the generic fallback
    const result = await findBestQboItem('recurring')
    expect(result).toEqual({ id: 'item-2', name: 'Recurring Clean' })
  })

  it('returns null (not items[0]) when no match at all', async () => {
    const noMatchItems = [
      { qboItemId: 'item-x', name: 'Barnacle Removal', description: null, unitPrice: null, syncedAt: new Date() },
    ]
    mockDbSelect(noMatchItems)
    // "powerwashing" has no exact, partial, or generic match in the list above
    const result = await findBestQboItem('powerwashing')
    expect(result).toBeNull()
  })
})
