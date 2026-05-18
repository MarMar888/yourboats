'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { saveTip, updateTierConfig, updateEmployeeTier } from './actions'
import { savePayrollEntries, getPayrollForPeriod, approvePayrollForPeriod } from './payroll-actions'
import type { SavedPayrollRow } from './payroll-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getCurrentPeriod,
  getPeriodByIndex,
  formatPeriodLabel,
  formatShortDate,
  type PayPeriod,
} from '@/lib/pay/periods'
import type { PeriodServiceRow, AssignmentRow } from '@/app/api/pay/period/route'

type Employee = { id: string; displayName: string; tier: 'top' | 'mid' | 'low' | null }
type TierRow = { tier: 'top' | 'mid' | 'low'; deductionPct: string }

function fmt(n: number) { return `$${n.toFixed(2)}` }

function fmtDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// ─── Period Review ────────────────────────────────────────────────────────────

function PeriodReview({
  period,
  employees,
  isOwnerOrManager,
}: {
  period: PayPeriod
  employees: Employee[]
  isOwnerOrManager: boolean
}) {
  const [rows, setRows] = useState<PeriodServiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tipInputs, setTipInputs] = useState<Record<string, string>>({})
  const [savingTip, setSavingTip] = useState<Record<string, boolean>>({})
  const [splitOverrides, setSplitOverrides] = useState<Record<string, Record<string, string>>>({})
  const [excludedUsers, setExcludedUsers] = useState<Record<string, Set<string>>>({})
  const [savedPayroll, setSavedPayroll] = useState<Record<string, SavedPayrollRow>>({})
  const [isDirty, setIsDirty] = useState(false)

  // Approval state
  const [approval, setApproval] = useState<{ at: Date; byName: string } | null>(null)
  const [approvePending, startApprove] = useTransition()
  const [saveDraftPending, startSaveDraft] = useTransition()

  // Per-employee breakdown
  const [selectedUserId, setSelectedUserId] = useState(employees[0]?.id ?? '')
  const [showPerEmployee, setShowPerEmployee] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setShowPerEmployee(false)
    setIsDirty(false)
    try {
      const [res, payrollRows] = await Promise.all([
        fetch(`/api/pay/period?startDate=${period.startStr}&endDate=${period.endStr}`),
        getPayrollForPeriod(period.startStr, period.endStr),
      ])
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setRows(data.services)

      const seeds: Record<string, string> = {}
      for (const s of data.services as PeriodServiceRow[]) {
        seeds[s.serviceId] = s.tipAmount != null ? String(s.tipAmount) : ''
      }
      setTipInputs(seeds)

      const payrollMap: Record<string, SavedPayrollRow> = {}
      const overrides: Record<string, Record<string, string>> = {}
      for (const pr of payrollRows) {
        payrollMap[`${pr.serviceId}:${pr.userId}`] = pr
        if (!overrides[pr.serviceId]) overrides[pr.serviceId] = {}
        overrides[pr.serviceId][pr.userId] = pr.splitPct
      }
      setSavedPayroll(payrollMap)
      setSplitOverrides(overrides)
      setExcludedUsers({})

      const approvedRow = payrollRows.find((r) => r.approvedAt && r.approvedByName)
      setApproval(approvedRow ? { at: approvedRow.approvedAt!, byName: approvedRow.approvedByName! } : null)
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

  function setSplitOverride(serviceId: string, userId: string, value: string) {
    setIsDirty(true)
    setSplitOverrides((prev) => ({
      ...prev,
      [serviceId]: { ...(prev[serviceId] ?? {}), [userId]: value },
    }))
  }

  function toggleExclude(serviceId: string, userId: string) {
    setIsDirty(true)
    setExcludedUsers((prev) => {
      const current = new Set(prev[serviceId] ?? [])
      if (current.has(userId)) {
        current.delete(userId)
      } else {
        current.add(userId)
        setSplitOverrides((sp) => {
          const overrides = { ...(sp[serviceId] ?? {}) }
          delete overrides[userId]
          return { ...sp, [serviceId]: overrides }
        })
      }
      return { ...prev, [serviceId]: current }
    })
  }

  function computeAssignmentsFor(row: PeriodServiceRow): {
    assignments: (AssignmentRow & { effectiveSplitPct: number; computedNetPay: number })[]
    splitsValid: boolean
  } {
    const excluded = excludedUsers[row.serviceId] ?? new Set<string>()
    const overrides = splitOverrides[row.serviceId] ?? {}
    const activeAssignments = row.assignments.filter((a) => !excluded.has(a.userId))

    if (activeAssignments.length === 0) return { assignments: [], splitsValid: true }

    const count = activeAssignments.length
    const basePct = Math.floor(100 / count)
    const remainder = 100 - basePct * count

    const computed = activeAssignments.map((a, idx) => {
      const defaultSplit = idx === count - 1 ? basePct + remainder : basePct
      const overrideRaw = overrides[a.userId]
      const rawPct = overrideRaw !== undefined && overrideRaw !== '' ? parseFloat(overrideRaw) : defaultSplit
      const split = isNaN(rawPct) ? defaultSplit : rawPct
      const effectivePct = Math.max(0, split - a.deductionPct)
      const computedNetPay = row.employeePool * (effectivePct / 100)
      return { ...a, effectiveSplitPct: split, computedNetPay }
    })

    const totalSplit = computed.reduce((sum, a) => sum + (isNaN(a.effectiveSplitPct) ? 0 : a.effectiveSplitPct), 0)
    return { assignments: computed, splitsValid: Math.abs(totalSplit - 100) < 0.01 }
  }

  function buildAllEntries() {
    return rows.flatMap((row) => {
      const { assignments: computed } = computeAssignmentsFor(row)
      const tipNum = parseFloat(tipInputs[row.serviceId] ?? '') || 0
      const tipPerPerson = computed.length > 0 ? tipNum / computed.length : 0
      return computed.map((a) => ({
        serviceId:    row.serviceId,
        userId:       a.userId,
        displayName:  a.displayName,
        serviceDate:  row.serviceDate,
        serviceType:  row.serviceType,
        customerName: row.customerName,
        totalPrice:   row.totalPrice,
        employeePool: row.employeePool,
        splitPct:     a.effectiveSplitPct,
        deductionPct: a.deductionPct,
        effectivePct: Math.max(0, a.effectiveSplitPct - a.deductionPct),
        netPay:       a.computedNetPay,
        tipShare:     tipPerPerson,
        totalPay:     a.computedNetPay + tipPerPerson,
      }))
    })
  }

  function handleSaveDraft() {
    startSaveDraft(async () => {
      const entries = buildAllEntries()
      if (entries.length > 0) {
        await savePayrollEntries(entries)
        setIsDirty(false)
      }
    })
  }

  function handleApprove() {
    startApprove(async () => {
      // Always save current state before approving
      const entries = buildAllEntries()
      if (entries.length > 0) await savePayrollEntries(entries)
      const result = await approvePayrollForPeriod(period.startStr, period.endStr)
      if (!result.error) {
        setIsDirty(false)
        await load()
      }
    })
  }

  function computePerEmployee(userId: string) {
    const svcs = []
    for (const row of rows) {
      const { assignments } = computeAssignmentsFor(row)
      const a = assignments.find((x) => x.userId === userId)
      if (!a) continue
      const tipNum = parseFloat(tipInputs[row.serviceId] ?? '') || row.tipAmount || 0
      const tipShare = assignments.length > 0 ? tipNum / assignments.length : 0
      const effectivePct = Math.max(0, a.effectiveSplitPct - a.deductionPct)
      svcs.push({
        serviceId: row.serviceId, serviceDate: row.serviceDate,
        serviceType: row.serviceType, customerName: row.customerName,
        totalPrice: row.totalPrice, serviceTypeShare: row.serviceTypeShare,
        employeePool: row.employeePool, splitPct: a.effectiveSplitPct,
        deductionPct: a.deductionPct, effectivePct,
        netPay: a.computedNetPay, tipShare, totalPay: a.computedNetPay + tipShare,
      })
    }
    const totalPay = svcs.reduce((s, x) => s + x.totalPay, 0)
    const totalTips = svcs.reduce((s, x) => s + x.tipShare, 0)
    return { services: svcs, summary: { totalPay, totalTips } }
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

  const grandTotal = rows.reduce((sum, r) => {
    const { assignments } = computeAssignmentsFor(r)
    return sum + assignments.reduce((s, a) => s + a.computedNetPay, 0)
  }, 0)
  const grandTips = rows.reduce((sum, r) =>
    sum + (parseFloat(tipInputs[r.serviceId] ?? '') || r.tipAmount || 0), 0)

  const perEmpData = showPerEmployee ? computePerEmployee(selectedUserId) : null
  const selectedEmployee = employees.find((e) => e.id === selectedUserId)

  return (
    <div className="space-y-4">
      {/* Approval banner */}
      {approval && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <span className="text-base">✓</span>
          <span>
            Payroll approved by <span className="font-semibold">{approval.byName}</span> on{' '}
            {approval.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      )}

      {/* Pay review table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap w-28">Date</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Client</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-36">Boats</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">People & splits</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap w-24">Pool</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap w-24">Total pay</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-24">Tip</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const tipRaw = tipInputs[row.serviceId] ?? ''
              const tipNum = parseFloat(tipRaw) || 0
              const excluded = excludedUsers[row.serviceId] ?? new Set<string>()
              const overrides = splitOverrides[row.serviceId] ?? {}
              const { assignments: computed, splitsValid } = computeAssignmentsFor(row)
              const rowTotal = computed.reduce((s, a) => s + a.computedNetPay, 0)
              const tipPerPerson = computed.length > 0 ? tipNum / computed.length : 0

              return (
                <tr key={row.serviceId} className="hover:bg-muted/20 align-top">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground text-xs">
                    {fmtDate(row.serviceDate)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.customerName}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{row.serviceType}</span>
                      <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground tabular-nums">
                        {row.serviceTypeShare}% pool
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {row.boats.length > 0 ? row.boats.join(', ') : <span className="text-muted-foreground/50">—</span>}
                  </td>

                  {/* People & splits — the core column */}
                  <td className="px-4 py-3 min-w-[280px]">
                    {row.assignments.length === 0 ? (
                      <span className="text-muted-foreground text-xs">Unassigned</span>
                    ) : (
                      <div className="space-y-2">
                        {row.assignments.map((a) => {
                          const isExcluded = excluded.has(a.userId)
                          const overrideVal = overrides[a.userId]
                          const compA = computed.find((x) => x.userId === a.userId)

                          const activeCount = row.assignments.filter((x) => !excluded.has(x.userId)).length
                          const activeIdx = row.assignments
                            .filter((x) => !excluded.has(x.userId))
                            .findIndex((x) => x.userId === a.userId)
                          const defaultSplit = activeCount > 0
                            ? activeIdx === activeCount - 1
                              ? Math.floor(100 / activeCount) + (100 - Math.floor(100 / activeCount) * activeCount)
                              : Math.floor(100 / activeCount)
                            : 0

                          return (
                            <div key={a.userId} className={`flex items-center gap-2 ${isExcluded ? 'opacity-40' : ''}`}>
                              {/* Exclude toggle */}
                              <button
                                type="button"
                                onClick={() => toggleExclude(row.serviceId, a.userId)}
                                className="text-muted-foreground hover:text-destructive text-xs leading-none w-4 h-4 flex items-center justify-center flex-shrink-0 transition-colors"
                                title={isExcluded ? 'Re-include' : 'Exclude from pay'}
                              >
                                {isExcluded ? '+' : '×'}
                              </button>

                              {/* Name */}
                              <span className={`text-sm font-medium w-32 truncate ${isExcluded ? 'line-through' : ''}`}>
                                {a.displayName}
                              </span>

                              {/* Split input */}
                              {!isExcluded && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    placeholder={String(defaultSplit)}
                                    value={overrideVal ?? ''}
                                    onChange={(e) => setSplitOverride(row.serviceId, a.userId, e.target.value)}
                                    className="w-16 h-6 text-xs text-right border border-input rounded px-1.5 bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                                    title="Split %"
                                  />
                                  <span className="text-muted-foreground text-xs">%</span>
                                  {a.deductionPct > 0 && (
                                    <span className="text-xs text-muted-foreground bg-muted rounded px-1 py-0.5">
                                      −{a.deductionPct}%
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Computed pay */}
                              {compA && (
                                <span className="ml-auto text-sm font-medium tabular-nums text-right min-w-[56px]">
                                  {fmt(compA.computedNetPay)}
                                  {tipPerPerson > 0 && (
                                    <span className="text-xs text-muted-foreground font-normal ml-1">
                                      +{fmt(tipPerPerson)}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )
                        })}
                        {!splitsValid && computed.length > 0 && (
                          <p className="text-[10px] text-amber-600">⚠ splits don&apos;t add to 100%</p>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground align-top pt-3.5">
                    {fmt(row.employeePool)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold align-top pt-3.5">
                    {fmt(rowTotal)}
                  </td>
                  <td className="px-4 py-3 align-top pt-2.5">
                    {isOwnerOrManager ? (
                      <div className="flex justify-end">
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
                            className="w-24 h-7 text-xs pl-5 pr-1"
                            disabled={savingTip[row.serviceId]}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="tabular-nums text-right block text-sm">
                        {row.tipAmount != null ? fmt(row.tipAmount) : <span className="text-muted-foreground">—</span>}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40">
              <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={4}>
                {rows.length} service{rows.length !== 1 ? 's' : ''}
                {grandTips > 0 && (
                  <span className="ml-2 text-muted-foreground/60">+ {fmt(grandTips)} tips</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                {fmt(rows.reduce((s, r) => s + r.employeePool, 0))}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                {fmt(grandTotal)}
              </td>
              <td className="px-4 py-2.5 text-right">
                {isOwnerOrManager && isDirty && (
                  <button
                    onClick={handleSaveDraft}
                    disabled={saveDraftPending}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {saveDraftPending ? 'Saving…' : 'Save draft'}
                  </button>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Approve bar */}
      {isOwnerOrManager && (
        <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">
              {approval ? 'Payroll approved' : 'Approve payroll'}
            </p>
            {approval ? (
              <p className="text-xs text-green-700 mt-0.5">
                Approved by <span className="font-medium">{approval.byName}</span> ·{' '}
                {approval.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                Saves current splits and locks in pay for this period
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant={approval ? 'outline' : 'default'}
            disabled={approvePending || rows.length === 0}
            onClick={handleApprove}
          >
            {approvePending ? 'Approving…' : approval ? 'Re-approve' : 'Approve payroll'}
          </Button>
        </div>
      )}

      {/* Per-employee breakdown */}
      {employees.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Per-employee breakdown</h2>
          <div className="rounded-lg border bg-card p-4 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Employee</label>
              <select
                value={selectedUserId}
                onChange={(e) => { setSelectedUserId(e.target.value); setShowPerEmployee(false) }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.displayName}</option>
                ))}
              </select>
            </div>
            <Button onClick={() => setShowPerEmployee(true)}>Calculate</Button>
          </div>

          {showPerEmployee && perEmpData && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                {selectedEmployee?.displayName} · {formatPeriodLabel(period)} · Payday {formatShortDate(period.payday)}
              </p>
              {perEmpData.services.length === 0 ? (
                <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
                  No completed services assigned to this employee in this period.
                </div>
              ) : (
                <div className="rounded-lg border bg-card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Customer</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Revenue</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Type %</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Pool</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Split − Deduct</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Net Pay</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">Tip</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {perEmpData.services.map((s) => (
                        <tr key={s.serviceId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                            {fmtDate(s.serviceDate)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div>{s.customerName}</div>
                            <div className="text-xs text-muted-foreground">{s.serviceType}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(s.totalPrice)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{s.serviceTypeShare}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(s.employeePool)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                            {s.splitPct.toFixed(1)}%
                            {s.deductionPct > 0 && (
                              <span className="text-red-500 ml-0.5">−{s.deductionPct}%</span>
                            )}
                            <span className="ml-1 font-medium text-foreground">= {s.effectivePct.toFixed(1)}%</span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmt(s.netPay)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                            {s.tipShare > 0 ? fmt(s.tipShare) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(s.totalPay)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40 font-semibold text-sm">
                        <td className="px-4 py-2" colSpan={6}>Summary</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(perEmpData.summary.totalPay - perEmpData.summary.totalTips)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-xs">{fmt(perEmpData.summary.totalTips)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(perEmpData.summary.totalPay)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
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

  const [tierEdits, setTierEdits] = useState<Record<string, string>>(
    Object.fromEntries(tierRows.map((r) => [r.tier, r.deductionPct]))
  )
  const [tierPending, startTierTransition] = useTransition()
  const [tierSaved, setTierSaved] = useState(false)

  const [employeeTierEdits, setEmployeeTierEdits] = useState<Record<string, string>>(
    Object.fromEntries(employees.map((e) => [e.id, e.tier ?? '']))
  )
  const [empTierPending, startEmpTierTransition] = useTransition()

  function prevPeriod() { setPeriod((p) => getPeriodByIndex(Math.max(0, p.index - 1))) }
  function nextPeriod() { setPeriod((p) => getPeriodByIndex(p.index + 1)) }

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

      {/* Period review + per-employee (unified, share state) */}
      <div>
        <h2 className="text-base font-semibold mb-3">Pay review</h2>
        <PeriodReview
          key={period.startStr}
          period={period}
          employees={employees}
          isOwnerOrManager={isOwner || true}
        />
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
    </div>
  )
}
