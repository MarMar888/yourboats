'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { saveTip, updateTierConfig, updateEmployeeTier } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getCurrentPeriod,
  getPeriodByIndex,
  formatPeriodLabel,
  formatShortDate,
  type PayPeriod,
} from '@/lib/pay/periods'
import type { PeriodServiceRow } from '@/app/api/pay/period/route'

type Employee = { id: string; displayName: string; tier: 'top' | 'mid' | 'low' | null }
type TierRow = { tier: 'top' | 'mid' | 'low'; deductionPct: string }
type PerEmployeeResult = {
  services: {
    serviceId: string; serviceDate: string; serviceType: string
    customerName: string; totalPrice: number
    serviceTypeShare: number; employeePool: number
    tipAmount: number; splitPct: number
    deductionPct: number; effectivePct: number
    netPay: number; tipShare: number; totalPay: number
  }[]
  summary: { totalPay: number; totalTips: number }
} | null

function fmt(n: number) { return `$${n.toFixed(2)}` }

function fmtDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// ─── Period Review Table ──────────────────────────────────────────────────────

function PeriodReview({
  period,
  isOwnerOrManager,
}: {
  period: PayPeriod
  isOwnerOrManager: boolean
}) {
  const [rows, setRows] = useState<PeriodServiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tipInputs, setTipInputs] = useState<Record<string, string>>({})
  const [savingTip, setSavingTip] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/pay/period?startDate=${period.startStr}&endDate=${period.endStr}`
      )
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setRows(data.services)
      const seeds: Record<string, string> = {}
      for (const s of data.services as PeriodServiceRow[]) {
        seeds[s.serviceId] = s.tipAmount != null ? String(s.tipAmount) : ''
      }
      setTipInputs(seeds)
    } finally {
      setLoading(false)
    }
  }, [period.startStr, period.endStr])

  useEffect(() => { load() }, [load])

  async function handleTipSave(serviceId: string) {
    const raw = tipInputs[serviceId] ?? ''
    const amount = raw === '' ? 0 : parseFloat(raw)
    if (isNaN(amount)) return
    setSavingTip((p) => ({ ...p, [serviceId]: true }))
    try {
      await saveTip(serviceId, amount)
      setRows((prev) =>
        prev.map((r) =>
          r.serviceId === serviceId ? { ...r, tipAmount: amount > 0 ? amount : null } : r
        )
      )
    } finally {
      setSavingTip((p) => ({ ...p, [serviceId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        No completed services in this pay period.
      </div>
    )
  }

  const grandTotal = rows.reduce((sum, r) => sum + r.totalNetPay, 0)
  const grandTips = rows.reduce((sum, r) => {
    return sum + (parseFloat(tipInputs[r.serviceId] ?? '') || r.tipAmount || 0)
  }, 0)

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Date</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Client</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Boats</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">People</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Pool</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Their Pay</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Total Pay</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tip</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Tip Split</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const tipRaw = tipInputs[row.serviceId] ?? ''
            const tipNum = parseFloat(tipRaw) || 0

            return (
              <tr key={row.serviceId} className="hover:bg-muted/20 align-top">
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground text-xs">
                  {fmtDate(row.serviceDate)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{row.customerName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {row.serviceType}
                    <span className="ml-1 text-[10px] bg-muted rounded px-1 py-0.5 tabular-nums">
                      {row.serviceTypeShare}% pool
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {row.boats.length > 0 ? row.boats.join(', ') : '—'}
                </td>
                <td className="px-3 py-2.5">
                  {row.assignments.length === 0 ? (
                    <span className="text-muted-foreground text-xs">Unassigned</span>
                  ) : (
                    <div className="space-y-0.5">
                      {row.assignments.map((a) => (
                        <div key={a.userId} className="text-xs">
                          <span className="font-medium">{a.displayName}</span>
                          <span className="text-muted-foreground ml-1">
                            ({a.splitPct}%{a.deductionPct > 0 ? `−${a.deductionPct}%` : ''})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                {/* Pool = revenue × service type share */}
                <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                  {fmt(row.employeePool)}
                </td>
                {/* Their Pay = pool × effectivePct */}
                <td className="px-3 py-2.5 text-right">
                  {row.assignments.length === 0 ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <div className="space-y-0.5">
                      {row.assignments.map((a) => (
                        <div key={a.userId} className="text-xs tabular-nums">
                          {fmt(a.netPay)}
                          <span className="text-muted-foreground ml-1 text-[10px]">
                            ({a.effectivePct.toFixed(1)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                  {fmt(row.totalNetPay)}
                </td>
                <td className="px-3 py-2.5">
                  {isOwnerOrManager ? (
                    <div className="flex items-center gap-1 justify-end">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={tipRaw}
                          onChange={(e) =>
                            setTipInputs((p) => ({ ...p, [row.serviceId]: e.target.value }))
                          }
                          onBlur={() => handleTipSave(row.serviceId)}
                          className="w-20 h-7 text-xs pl-5 pr-1"
                          disabled={savingTip[row.serviceId]}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="tabular-nums text-right block">
                      {row.tipAmount != null ? fmt(row.tipAmount) : '—'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {tipNum > 0 && row.assignments.length > 0 ? (
                    <div className="space-y-0.5">
                      {row.assignments.map((a) => (
                        <div key={a.userId} className="text-xs tabular-nums">
                          <span className="text-muted-foreground">{a.displayName}:</span>{' '}
                          {fmt(tipNum * (a.splitPct / 100))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 font-semibold text-sm">
            <td className="px-3 py-2" colSpan={6}>
              Period total — {rows.length} service{rows.length !== 1 ? 's' : ''}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{fmt(grandTotal)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground font-normal text-xs">
              {grandTips > 0 ? fmt(grandTips) : ''}
            </td>
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function PayClient({
  employees,
  tierRows,
  isOwner,
}: {
  employees: Employee[]
  tierRows: TierRow[]
  isOwner: boolean
}) {
  const [period, setPeriod] = useState<PayPeriod>(getCurrentPeriod)
  const [selectedUserId, setSelectedUserId] = useState(employees[0]?.id ?? '')
  const [payData, setPerEmployeeData] = useState<PerEmployeeResult>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tierEdits, setTierEdits] = useState<Record<string, string>>(
    Object.fromEntries(tierRows.map((r) => [r.tier, r.deductionPct]))
  )
  const [tierPending, startTierTransition] = useTransition()
  const [tierSaved, setTierSaved] = useState(false)

  const [employeeTierEdits, setEmployeeTierEdits] = useState<Record<string, string>>(
    Object.fromEntries(employees.map((e) => [e.id, e.tier ?? '']))
  )
  const [empTierPending, startEmpTierTransition] = useTransition()

  function prevPeriod() {
    setPeriod((p) => getPeriodByIndex(Math.max(0, p.index - 1)))
    setPerEmployeeData(null)
  }
  function nextPeriod() {
    setPeriod((p) => getPeriodByIndex(p.index + 1))
    setPerEmployeeData(null)
  }

  async function loadPerEmployee() {
    if (!selectedUserId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/pay?userId=${selectedUserId}&startDate=${period.startStr}&endDate=${period.endStr}`
      )
      if (!res.ok) throw new Error('Failed to load pay data')
      setPerEmployeeData(await res.json())
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
        if (!isNaN(pct)) await updateTierConfig(tier as 'top' | 'mid' | 'low', pct)
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
      {/* Period navigator */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={prevPeriod} disabled={period.index === 0}>←</Button>
          <div className="flex-1 text-center">
            <div className="text-xs font-medium text-muted-foreground">Pay period</div>
            <div className="text-base font-semibold">{formatPeriodLabel(period)}</div>
          </div>
          <Button variant="outline" size="sm" onClick={nextPeriod}>→</Button>
        </div>
        <div className="flex justify-center gap-6 text-xs text-muted-foreground border-t pt-3">
          <span>
            <span className="font-medium text-foreground">Payroll deadline:</span>{' '}
            {formatShortDate(period.deadline)}
          </span>
          <span>
            <span className="font-medium text-foreground">Payday:</span>{' '}
            {formatShortDate(period.payday)}
          </span>
        </div>
      </div>

      {/* Period review table */}
      <div>
        <h2 className="text-base font-semibold mb-3">Pay review</h2>
        <PeriodReview period={period} isOwnerOrManager={isOwner || true} />
      </div>

      {/* Per-employee breakdown */}
      <div>
        <h2 className="text-base font-semibold mb-3">Per-employee breakdown</h2>
        <div className="rounded-lg border bg-card p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Employee</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.displayName}</option>
              ))}
            </select>
          </div>
          <Button onClick={loadPerEmployee} disabled={loading}>
            {loading ? 'Loading…' : 'Calculate'}
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {payData && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              {employees.find((e) => e.id === selectedUserId)?.displayName} · {formatPeriodLabel(period)} · Payday {formatShortDate(period.payday)}
            </p>
            {payData.services.length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
                No completed services in this period.
              </div>
            ) : (
              <div className="rounded-lg border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Customer</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Revenue</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Type %</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Pool</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Split − Deduct</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Net Pay</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Tip</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payData.services.map((s) => (
                      <tr key={s.serviceId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDate(s.serviceDate)}
                        </td>
                        <td className="px-3 py-2">
                          <div>{s.customerName}</div>
                          <div className="text-xs text-muted-foreground">{s.serviceType}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(s.totalPrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">
                          {s.serviceTypeShare}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {fmt(s.employeePool)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {s.splitPct}%
                          {s.deductionPct > 0 && (
                            <span className="text-red-500 ml-0.5">−{s.deductionPct}%</span>
                          )}
                          <span className="ml-1 font-medium text-foreground">= {s.effectivePct.toFixed(1)}%</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(s.netPay)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {s.tipShare > 0 ? fmt(s.tipShare) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(s.totalPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/40 font-semibold text-sm">
                      <td className="px-3 py-2" colSpan={6}>Summary</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(payData.summary.totalPay - payData.summary.totalTips)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(payData.summary.totalTips)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(payData.summary.totalPay)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tier settings — owner only */}
      {isOwner && (
        <div>
          <h2 className="text-base font-semibold mb-3">Tier deduction settings</h2>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Tier deductions are taken from each employee&apos;s base pay after the service-type pool share is applied.
            </p>
            {(['top', 'mid', 'low'] as const).map((tier) => (
              <div key={tier} className="flex items-center gap-3">
                <span className="w-10 capitalize text-sm font-medium">{tier}</span>
                <div className="relative">
                  <Input
                    type="number" min="0" max="100" step="0.5"
                    value={tierEdits[tier] ?? '0'}
                    onChange={(e) => setTierEdits((p) => ({ ...p, [tier]: e.target.value }))}
                    className="w-24 pr-7"
                    disabled={tierPending}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            ))}
            <Button size="sm" onClick={saveTierConfig} disabled={tierPending} className="mt-1">
              {tierPending ? 'Saving…' : tierSaved ? 'Saved!' : 'Save tier config'}
            </Button>
          </div>
        </div>
      )}

      {/* Employee tier assignments — owner only */}
      {isOwner && employees.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Employee tiers</h2>
          <div className="rounded-lg border bg-card divide-y">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <span className="text-sm font-medium">{emp.displayName}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={employeeTierEdits[emp.id] ?? ''}
                    onChange={(e) => setEmployeeTierEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    disabled={empTierPending}
                  >
                    <option value="">No tier</option>
                    <option value="top">Top</option>
                    <option value="mid">Mid</option>
                    <option value="low">Low</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={() => saveEmployeeTier(emp.id)} disabled={empTierPending}>
                    Save
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service type share reference */}
      <div>
        <h2 className="text-base font-semibold mb-3">Service type pay shares</h2>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Service type</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Employee share</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ['Recurring Services', 55],
                ['Detailing Services', 50],
                ['Buffing/Waxing Services', 45],
                ['Acid Washing Services', 40],
                ['Powerwashing Services', 50],
                ['Gelcoat/Wetsanding Services', 50],
                ['Captaining Services', 83],
                ['SIO2 Coating', 40],
                ['Other Services', 50],
                ['Training Pay', 100],
              ].map(([name, pct]) => (
                <tr key={name as string} className="hover:bg-muted/20">
                  <td className="px-4 py-2">{name}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
