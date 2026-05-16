'use client'

import { useState, useTransition } from 'react'
import { updateTierConfig, updateEmployeeTier } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Employee = { id: string; displayName: string; tier: 'top' | 'mid' | 'low' | null }
type TierRow = { tier: 'top' | 'mid' | 'low'; deductionPct: string }
type ServicePay = {
  serviceId: string
  serviceDate: string
  customerName: string
  totalPrice: number
  tipAmount: number
  sharePct: number
  basePay: number
  deductionPct: number
  deduction: number
  netPay: number
  tipShare: number
  totalPay: number
}
type PayResult = {
  services: ServicePay[]
  summary: { totalPay: number; totalTips: number; totalDeductions: number }
} | null

function fmt(n: number) {
  return `$${n.toFixed(2)}`
}

function currentPeriod(): { start: string; end: string } {
  const today = new Date()
  const day = today.getDate()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  if (day < 16) {
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-15`,
    }
  }
  const lastDay = new Date(y, today.getMonth() + 1, 0).getDate()
  return {
    start: `${y}-${m}-16`,
    end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function PayClient({
  employees,
  tierRows,
  isOwner,
}: {
  employees: Employee[]
  tierRows: TierRow[]
  isOwner: boolean
}) {
  const period = currentPeriod()
  const [startDate, setStartDate] = useState(period.start)
  const [endDate, setEndDate] = useState(period.end)
  const [selectedUserId, setSelectedUserId] = useState(employees[0]?.id ?? '')
  const [payData, setPayData] = useState<PayResult>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tier config edit state
  const [tierEdits, setTierEdits] = useState<Record<string, string>>(
    Object.fromEntries(tierRows.map((r) => [r.tier, r.deductionPct]))
  )
  const [tierPending, startTierTransition] = useTransition()
  const [tierSaved, setTierSaved] = useState(false)

  // Employee tier edit
  const [employeeTierEdits, setEmployeeTierEdits] = useState<Record<string, string>>(
    Object.fromEntries(employees.map((e) => [e.id, e.tier ?? '']))
  )
  const [empTierPending, startEmpTierTransition] = useTransition()

  async function loadPay() {
    if (!selectedUserId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/pay?userId=${selectedUserId}&startDate=${startDate}&endDate=${endDate}`
      )
      if (!res.ok) throw new Error('Failed to load pay data')
      const data = await res.json()
      setPayData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  function saveTierConfig() {
    startTierTransition(async () => {
      for (const [tier, val] of Object.entries(tierEdits)) {
        const pct = parseFloat(val)
        if (!isNaN(pct)) {
          await updateTierConfig(tier as 'top' | 'mid' | 'low', pct)
        }
      }
      setTierSaved(true)
      setTimeout(() => setTierSaved(false), 2000)
    })
  }

  function saveEmployeeTier(userId: string) {
    startEmpTierTransition(async () => {
      const tier = employeeTierEdits[userId] as 'top' | 'mid' | 'low' | null
      await updateEmployeeTier(userId, tier || null)
    })
  }

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="rounded-lg border bg-card p-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Start date</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">End date</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Employee</label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={loadPay} disabled={loading}>
          {loading ? 'Loading…' : 'Calculate'}
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pay table */}
      {payData && (
        <div>
          <h2 className="text-base font-semibold mb-3">
            Pay breakdown —{' '}
            {employees.find((e) => e.id === selectedUserId)?.displayName}
          </h2>
          {payData.services.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
              No completed services in this period.
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total Price</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tip</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Share%</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Base Pay</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Deduction</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Net Pay</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tip Share</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payData.services.map((s) => (
                    <tr key={s.serviceId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{s.serviceDate}</td>
                      <td className="px-3 py-2">{s.customerName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(s.totalPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.tipAmount ? fmt(s.tipAmount) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.sharePct}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(s.basePay)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">
                        {s.deduction > 0 ? `-${fmt(s.deduction)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(s.netPay)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.tipShare > 0 ? fmt(s.tipShare) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(s.totalPay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td className="px-3 py-2" colSpan={6}>Summary</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">
                      -{fmt(payData.summary.totalDeductions)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" />
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(payData.summary.totalTips)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(payData.summary.totalPay)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tier settings — owner only */}
      {isOwner && (
        <div>
          <h2 className="text-base font-semibold mb-3">Tier deduction settings</h2>
          <div className="rounded-lg border bg-card p-4 space-y-3 max-w-sm">
            {(['top', 'mid', 'low'] as const).map((tier) => (
              <div key={tier} className="flex items-center gap-3">
                <span className="w-10 capitalize text-sm font-medium">{tier}</span>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={tierEdits[tier] ?? '0'}
                    onChange={(e) =>
                      setTierEdits((prev) => ({ ...prev, [tier]: e.target.value }))
                    }
                    className="w-24 pr-7"
                    disabled={tierPending}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            ))}
            <Button
              size="sm"
              onClick={saveTierConfig}
              disabled={tierPending}
              className="mt-1"
            >
              {tierPending ? 'Saving…' : tierSaved ? 'Saved!' : 'Save tier config'}
            </Button>
          </div>
        </div>
      )}

      {/* Employee tier assignments — owner only */}
      {isOwner && employees.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Employee tiers</h2>
          <div className="rounded-lg border bg-card divide-y max-w-md">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <span className="text-sm font-medium">{emp.displayName}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={employeeTierEdits[emp.id] ?? ''}
                    onChange={(e) =>
                      setEmployeeTierEdits((prev) => ({ ...prev, [emp.id]: e.target.value }))
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    disabled={empTierPending}
                  >
                    <option value="">No tier</option>
                    <option value="top">Top</option>
                    <option value="mid">Mid</option>
                    <option value="low">Low</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveEmployeeTier(emp.id)}
                    disabled={empTierPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
