import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}))

import { getNextQboDocNumber } from '@/lib/qbo/doc-number'
import { db } from '@/lib/db'

function mockLocalMax(value: number | null) {
  const chain = {
    from: vi.fn().mockResolvedValue([{ max: value }]),
  }
  ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getNextQboDocNumber', () => {
  it('uses QBO max + 1 when QBO query succeeds', async () => {
    const qboClient = {
      query: vi.fn((_sql: string, cb: (err: null, data: object) => void) => {
        cb(null, { QueryResponse: { Invoice: [{ DocNumber: '1350' }] } })
      }),
    }
    const result = await getNextQboDocNumber(qboClient)
    expect(result).toBe('1400') // max(1350, 1399) + 1 = 1400
  })

  it('respects MIN_DOC_NUMBER floor even if QBO max is higher', async () => {
    const qboClient = {
      query: vi.fn((_sql: string, cb: (err: null, data: object) => void) => {
        cb(null, { QueryResponse: { Invoice: [{ DocNumber: '1405' }] } })
      }),
    }
    const result = await getNextQboDocNumber(qboClient)
    expect(result).toBe('1406') // max(1405, 1399) + 1 = 1406
  })

  it('falls back to local DB max when QBO query throws', async () => {
    const qboClient = {
      query: vi.fn((_sql: string, cb: (err: Error, data: null) => void) => {
        cb(new Error('QBO unavailable'), null)
      }),
    }
    mockLocalMax(1410)
    const result = await getNextQboDocNumber(qboClient)
    expect(result).toBe('1411')
  })

  it('returns "1400" when QBO fails and local DB is empty', async () => {
    const qboClient = {
      query: vi.fn((_sql: string, cb: (err: Error, data: null) => void) => {
        cb(new Error('QBO unavailable'), null)
      }),
    }
    mockLocalMax(null)
    const result = await getNextQboDocNumber(qboClient)
    expect(result).toBe('1400')
  })
})
