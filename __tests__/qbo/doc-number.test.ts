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
  it('finds numeric max even when QBO returns lexicographic order', async () => {
    // "999" sorts before "1400" lexicographically — we must find 1400 as the true max
    const qboClient = {
      query: vi.fn((_sql: string, cb: (err: null, data: object) => void) => {
        cb(null, {
          QueryResponse: {
            Invoice: [
              { DocNumber: '999' },
              { DocNumber: '1400' },
              { DocNumber: '1350' },
              { DocNumber: '1033' },
            ],
          },
        })
      }),
    }
    const result = await getNextQboDocNumber(qboClient)
    expect(result).toBe('1401') // numeric max is 1400 → next is 1401
  })

  it('respects MIN_DOC_NUMBER floor when all QBO numbers are below it', async () => {
    const qboClient = {
      query: vi.fn((_sql: string, cb: (err: null, data: object) => void) => {
        cb(null, { QueryResponse: { Invoice: [{ DocNumber: '1350' }] } })
      }),
    }
    const result = await getNextQboDocNumber(qboClient)
    expect(result).toBe('1400') // max(1350, 1399) + 1 = 1400
  })

  it('uses numeric max above MIN_DOC_NUMBER', async () => {
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
