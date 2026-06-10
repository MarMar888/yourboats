import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  log: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/email/client', () => ({
  emailTransport: null,
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}))

import { savePayrollEntries, type PayrollEntryInput } from '@/app/(app)/pay/payroll-actions'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'

const baseEntry: PayrollEntryInput = {
  serviceId: 'service-with-stale-invoice',
  userId: 'employee-1',
  displayName: 'Employee One',
  serviceDate: '2026-05-28',
  serviceType: 'recurring',
  customerName: 'Jill Miller',
  totalPrice: 238.5,
  employeePool: 143.1,
  splitPct: 50,
  deductionPct: 0,
  effectivePct: 50,
  netPay: 71.55,
  tipShare: 0,
  totalPay: 71.55,
}

function mockServiceInvoiceLookup(rows: Array<{
  id: string
  invoiceId: string | null
  existingInvoiceId: string | null
}>) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  }
  ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  return chain
}

function mockUpdate() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  ;(db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  return chain
}

function mockInsert() {
  const conflictChain = {
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  }
  const chain = {
    values: vi.fn().mockReturnValue(conflictChain),
  }
  ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  return { chain, conflictChain }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'owner-1',
    displayName: 'Owner One',
    role: 'owner',
    email: 'owner@example.com',
  })
})

describe('savePayrollEntries', () => {
  it('does not copy stale service invoice IDs into payroll rows', async () => {
    mockServiceInvoiceLookup([
      {
        id: 'service-with-stale-invoice',
        invoiceId: 'missing-invoice',
        existingInvoiceId: null,
      },
    ])
    const update = mockUpdate()
    const insert = mockInsert()

    const result = await savePayrollEntries([baseEntry])

    expect(result).toEqual({ saved: 1 })
    expect(update.set).toHaveBeenCalledWith({ invoiceId: null })
    expect(insert.chain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        serviceId: 'service-with-stale-invoice',
        invoiceId: null,
      }),
    ])
  })

  it('keeps valid service invoice IDs on payroll rows', async () => {
    mockServiceInvoiceLookup([
      {
        id: 'service-with-valid-invoice',
        invoiceId: 'existing-invoice',
        existingInvoiceId: 'existing-invoice',
      },
    ])
    const update = mockUpdate()
    const insert = mockInsert()

    const result = await savePayrollEntries([
      { ...baseEntry, serviceId: 'service-with-valid-invoice' },
    ])

    expect(result).toEqual({ saved: 1 })
    expect(update.set).not.toHaveBeenCalled()
    expect(insert.chain.values).toHaveBeenCalledWith([
      expect.objectContaining({
        serviceId: 'service-with-valid-invoice',
        invoiceId: 'existing-invoice',
      }),
    ])
  })
})
