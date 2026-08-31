import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/pay/season-tips', () => ({
  getSeasonTips: vi.fn(),
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getSeasonTips } from '@/lib/pay/season-tips'
import { GET } from '@/app/api/pay/season-tips/route'

function request(query: string) {
  return new NextRequest(`https://yourboats.test/api/pay/season-tips${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/pay/season-tips', () => {
  it('rejects unauthenticated requests', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const response = await GET(request('?startDate=2026-01-01&endDate=2026-08-31'))

    expect(response.status).toBe(401)
    expect(getSeasonTips).not.toHaveBeenCalled()
  })

  it('rejects malformed or reversed date ranges', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'employee-1', displayName: 'Employee One', role: 'employee', email: 'employee@example.com',
    })

    const malformed = await GET(request('?startDate=2026-02-30&endDate=2026-08-31'))
    const reversed = await GET(request('?startDate=2026-08-31&endDate=2026-01-01'))

    expect(malformed.status).toBe(400)
    expect(reversed.status).toBe(400)
    expect(getSeasonTips).not.toHaveBeenCalled()
  })

  it('prevents employees from requesting another employee’s tips', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'employee-1', displayName: 'Employee One', role: 'employee', email: 'employee@example.com',
    })

    const response = await GET(request(
      '?startDate=2026-01-01&endDate=2026-08-31&userId=employee-2'
    ))

    expect(response.status).toBe(401)
    expect(getSeasonTips).not.toHaveBeenCalled()
  })

  it('allows an owner to preview another employee and passes the validated range through', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'owner-1', displayName: 'Owner One', role: 'owner', email: 'owner@example.com',
    })
    vi.mocked(getSeasonTips).mockResolvedValue({ jobs: [], totalTips: 0 })

    const response = await GET(request(
      '?startDate=2026-01-01&endDate=2026-08-31&userId=employee-2'
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ jobs: [], totalTips: 0 })
    expect(getSeasonTips).toHaveBeenCalledWith({
      userId: 'employee-2', startDate: '2026-01-01', endDate: '2026-08-31',
    })
  })
})
