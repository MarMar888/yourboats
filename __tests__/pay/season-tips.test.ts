import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
}))

import { getSeasonTips } from '@/lib/pay/season-tips'
import { db } from '@/lib/db'

function chainWithResult(result: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  }
  return chain
}

function chainWhereResult(result: unknown) {
  const chain = chainWithResult([])
  chain.where.mockResolvedValue(result)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getSeasonTips', () => {
  it('returns an empty result without querying the remaining tables when no jobs are assigned', async () => {
    const assigned = chainWhereResult([])
    ;(db.selectDistinct as ReturnType<typeof vi.fn>).mockReturnValueOnce(assigned)

    await expect(getSeasonTips({
      userId: 'employee-1',
      startDate: '2026-01-01',
      endDate: '2026-08-31',
    })).resolves.toEqual({ jobs: [], totalTips: 0 })

    expect(db.select).not.toHaveBeenCalled()
    expect(db.selectDistinct).toHaveBeenCalledTimes(1)
  })

  it('deduplicates per-boat assignments and splits the tip across valid workers', async () => {
    const assigned = chainWhereResult([{ serviceId: 'service-1' }])
    const services = chainWithResult([{
      serviceId: 'service-1',
      serviceDate: '2026-06-15',
      serviceType: 'recurring',
      customerName: 'Jill Miller',
      tipAmount: '25.00',
    }])
    const workers = chainWhereResult([
      { serviceId: 'service-1', userId: 'employee-1' },
      { serviceId: 'service-1', userId: 'employee-1' },
      { serviceId: 'service-1', userId: 'employee-2' },
    ])
    const boats = chainWhereResult([
      { serviceId: 'service-1', nickname: 'Sea Ray' },
    ])

    ;(db.selectDistinct as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(assigned)
      .mockReturnValueOnce(workers)
    ;(db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(services)
      .mockReturnValueOnce(boats)

    await expect(getSeasonTips({
      userId: 'employee-1',
      startDate: '2026-01-01',
      endDate: '2026-08-31',
    })).resolves.toEqual({
      jobs: [{
        serviceId: 'service-1',
        serviceDate: '2026-06-15',
        serviceType: 'recurring',
        customerName: 'Jill Miller',
        boats: ['Sea Ray'],
        tipAmount: 25,
        workerCount: 2,
        tipShare: 12.5,
      }],
      totalTips: 12.5,
    })
  })
})
