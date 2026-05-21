'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { saveTip, updateTierConfig } from './actions'
import { savePayrollEntries, getPayrollForPeriod, approvePayrollForPeriod, unapprovePayrollForPeriod } from './payroll-actions'
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

type SalariedLine = {
  id: string
  userId: string
  type: 'gm_salary' | 'quality_bonus'
  displayName: string
  amount: string
  status: 'pending' | 'approved' | 'denied' | 'ineligible'
  ineligibleReason: string | null
  approvedByName: string | null
  approvedAt: Date | null
}

function fmt(n: number) { return `$${n.toFixed(2)}` }

function fmtDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// ─── Salaried Section ─────────────────────────────────────────────────────────

function SalariedSection({ lines }: { lines: SalariedLine[] }) {
  const [pending, startTransition] = useTransition()
  const [actionLineId, setActionLineId] = useState<string | null>(null)

  async function handleApprove(id: string) {
    setActionLineId(id)
    startTransition(async () => {
      try {
        const mod = await import('./salaried-actions')
        await mod.approveSalariedLine(id)
      } catch {
        // salaried-actions not yet available — no-op
      }
      setActionLineId(null)
    })
  }

  async function handleDeny(id: string) {
    setActionLineId(id)
    startTransition(async () => {
      try {
        const mod = await import('./salaried-actions')
        await mod.denySalariedLine(id)
      } catch {
        // salaried-actions not yet available — no-op
      }
      setActionLineId(null)
    })
  }

  const statusBadge = (line: SalariedLine) => {
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium'
    if (line.status === 'approved') return <span className={`${base} bg-green-100 text-green-800`}>Approved</span>
    if (line.status === 'denied') return <span className={`${base} bg-red-100 text-red-800`}>Denied</span>
    if (line.status === 'ineligible') return <span className={`${base} bg-muted text-muted-foreground`}>Ineligible</span>
    return <span className={`${base} bg-amber-100 text-amber-800`}>Pending</span>
  }

  const typeLabel = (type: SalariedLine['type']) =>
    type === 'gm_salary' ? 'GM Salary' : 'Quality Bonus'

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <span className="text-sm font-semibold">Salaried lines — Nathan Bongard</span>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Auto-generated
        </span>
      </div>

      {lines.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground/70 text-center">
          No salaried lines for this period.
        </div>
      ) : (
        <div className="divide-y">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{typeLabel(line.type)}</span>
                  <span className="text-xs text-muted-foreground">{line.displayName}</span>
                </div>
                <div className="text-sm font-semibold tabular-nums mt-0.5">
                  {fmt(parseFloat(line.amount) || 0)}
                </div>
                {line.status === 'ineligible' && line.ineligibleReason && (
                  <p className="text-xs text-muted-foreground mt-0.5">{line.ineligibleReason}</p>
                )}
                {line.status === 'approved' && line.approvedByName && (
                  <p className="text-xs text-green-700 mt-0.5">
                    Approved by {line.approvedByName}
                    {line.approvedAt && (
                      <span className="text-muted-foreground ml-1">
                        · {line.approvedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Right: status + actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {statusBadge(line)}
                {line.status === 'pending' && line.type === 'quality_bonus' && (
                  <>
                    <button
                      onClick={() => handleDeny(line.id)}
                      disabled={pending && actionLineId === line.id}
                      className="text-xs text-muted-foreground hover:text-destructive underline-offset-2 hover:underline transition-colors disabled:opacity-50"
                    >
                      Deny
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending && actionLineId === line.id}
                      onClick={() => handleApprove(line.id)}
                      className="h-7 text-xs"
                    >
                      {pending && actionLineId === line.id ? 'Saving…' : 'Approve'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Period Review ────────────────────────────────────────────────────────────

function PeriodReview({
  period,
  employees,
  tierRows,
  isOwnerOrManager,
  salariedLines,
}: {
  period: PayPeriod
  employees: Employee[]
  tierRows: TierRow[]
  isOwnerOrManager: boolean
  salariedLines: SalariedLine[]
}) {
  const [rows, setRows] = useState<PeriodServiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tipInputs, setTipInputs] = useState<Record<string, string>>({})
  const [savingTip, setSavingTip] = useState<Record<string, boolean>>({})
  const [splitOverrides, setSplitOverrides] = useState<Record<string, Record<string, string>>>({})
  const [excludedUsers, setExcludedUsers] = useState<Record<string, Set<string>>>({})
  const [addedUsers, setAddedUsers] = useState<Record<string, { userId: string; displayName: string; deductionPct: number }[]>>({})
  const [savedPayroll, setSavedPayroll] = useState<Record<string, SavedPayrollRow>>({})
  const [isDirty, setIsDirty] = useState(false)

  // Approval state
  const [approval, setApproval] = useState<{ at: Date; byName: string } | null>(null)
  const [approvePending, startApprove] = useTransition()
  const [unapprovePending, startUnapprove] = useTransition()
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
      const reconstructedAdded: Record<string, { userId: string; displayName: string; deductionPct: number }[]> = {}
      const serviceRows = data.services as PeriodServiceRow[]

      for (const pr of payrollRows) {
        payrollMap[`${pr.serviceId}:${pr.userId}`] = pr
        if (!overrides[pr.serviceId]) overrides[pr.serviceId] = {}
        overrides[pr.serviceId][pr.userId] = pr.splitPct

        const svcRow = serviceRows.find((s) => s.serviceId === pr.serviceId)
        if (svcRow && !svcRow.assignments.some(
          (a) => a.userId === pr.userId || a.displayName === pr.displayName
        )) {
          if (!reconstructedAdded[pr.serviceId]) reconstructedAdded[pr.serviceId] = []
          reconstructedAdded[pr.serviceId].push({
            userId:       pr.userId,
            displayName:  pr.displayName,
            deductionPct: parseFloat(pr.deductionPct) || 0,
          })
        }
      }
      setSavedPayroll(payrollMap)
      setSplitOverrides(overrides)
      setExcludedUsers({})
      setAddedUsers(reconstructedAdded)

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

  function getEmployeeDeductionPct(userId: string): number {
    const emp = employees.find((e) => e.id === userId)
    if (!emp || !emp.tier) return 0
    const tr = tierRows.find((t) => t.tier === emp.tier)
    return tr ? parseFloat(tr.deductionPct) || 0 : 0
  }

  function addPersonToRow(serviceId: string, userId: string) {
    const emp = employees.find((e) => e.id === userId)
    if (!emp) return
    setIsDirty(true)
    setAddedUsers((prev) => ({
      ...prev,
      [serviceId]: [...(prev[serviceId] ?? []), {
        userId: emp.id,
        displayName: emp.displayName,
        deductionPct: getEmployeeDeductionPct(emp.id),
      }],
    }))
  }

  function removeAddedUser(serviceId: string, userId: string) {
    setIsDirty(true)
    setAddedUsers((prev) => ({
      ...prev,
      [serviceId]: (prev[serviceId] ?? []).filter((u) => u.userId !== userId),
    }))
    setSplitOverrides((sp) => {
      const overrides = { ...(sp[serviceId] ?? {}) }
      delete overrides[userId]
      return { ...sp, [serviceId]: overrides }
    })
  }

  function computeAssignmentsFor(row: PeriodServiceRow): {
    assignments: (AssignmentRow & { effectiveSplitPct: number; computedNetPay: number })[]
    splitsValid: boolean
  } {
    const excluded = excludedUsers[row.serviceId] ?? new Set<string>()
    const overrides = splitOverrides[row.serviceId] ?? {}
    const added = (addedUsers[row.serviceId] ?? []).map((u) => ({
      userId: u.userId, displayName: u.displayName, deductionPct: u.deductionPct,
      splitPct: 0, effectivePct: 0, netPay: 0,
    }))
    const seenNames = new Set<string>()
    const allAssignments = [...row.assignments, ...added].filter((a) => {
      if (seenNames.has(a.displayName)) return false
      seenNames.add(a.displayName)
      return true
    })
    const activeAssignments = allAssignments.filter((a) => !excluded.has(a.userId))

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

  function handleUnapprove() {
    startUnapprove(async () => {
      const result = await unapprovePayrollForPeriod(period.startStr, period.endStr)
      if (!result.error) {
        setApproval(null)
        setIsDirty(false)
      }
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
    // Include salaried lines belonging to this employee
    const empSalaried = salariedLines.filter((l) => l.userId === userId)
    const salariedTotal = empSalaried
      .filter((l) => l.status === 'approved')
      .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

    const totalPay = svcs.reduce((s, x) => s + x.totalPay, 0) + salariedTotal
    const totalTips = svcs.reduce((s, x) => s + x.tipShare, 0)
    return { services: svcs, salariedItems: empSalaried, summary: { totalPay, totalTips, salariedTotal } }
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
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
      {/* Pay review table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap w-24">Date</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-40">Client</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Boats</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">People & splits</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap w-20">Pool</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap w-22">Pay</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Tip</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, rowIdx) => {
              const tipRaw = tipInputs[row.serviceId] ?? ''
              const tipNum = parseFloat(tipRaw) || 0
              const excluded = excludedUsers[row.serviceId] ?? new Set<string>()
              const overrides = splitOverrides[row.serviceId] ?? {}
              const { assignments: computed, splitsValid } = computeAssignmentsFor(row)
              const rowTotal = computed.reduce((s, a) => s + a.computedNetPay, 0)
              const tipPerPerson = computed.length > 0 ? tipNum / computed.length : 0

              return (
                <tr key={row.serviceId} className={`align-top ${rowIdx % 2 === 1 ? 'bg-muted/10' : ''} hover:bg-muted/20 transition-colors`}>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground text-xs">
                    {fmtDate(row.serviceDate)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-sm leading-tight">{row.customerName}</div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{row.serviceType}</span>
                      <span className="text-[10px] bg-muted rounded px-1.5 py-px text-muted-foreground tabular-nums">
                        {row.serviceTypeShare}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {row.boats.length > 0 ? row.boats.join(', ') : <span className="text-muted-foreground/40">—</span>}
                  </td>

                  {/* People & splits — widest column */}
                  <td className="px-3 py-2.5 min-w-[320px]">
                    {(() => {
                      const assignedNames = new Set(row.assignments.map((a) => a.displayName))
                      const rowAdded = (addedUsers[row.serviceId] ?? []).filter(
                        (u) => !assignedNames.has(u.displayName)
                      )
                      const alreadyInRow = new Set([
                        ...row.assignments.map((a) => a.userId),
                        ...rowAdded.map((u) => u.userId),
                      ])
                      const availableToAdd = employees.filter((e) => !alreadyInRow.has(e.id))

                      function renderPersonRow(
                        userId: string,
                        displayName: string,
                        deductionPct: number,
                        isAdded: boolean
                      ) {
                        const isExcluded = excluded.has(userId)
                        const overrideVal = overrides[userId]
                        const compA = computed.find((x) => x.userId === userId)
                        const activeList = [...row.assignments, ...rowAdded].filter((x) => !excluded.has(x.userId))
                        const activeCount = activeList.length
                        const activeIdx = activeList.findIndex((x) => x.userId === userId)
                        const defaultSplit = activeCount > 0
                          ? activeIdx === activeCount - 1
                            ? Math.floor(100 / activeCount) + (100 - Math.floor(100 / activeCount) * activeCount)
                            : Math.floor(100 / activeCount)
                          : 0

                        return (
                          <div key={userId} className={`flex items-center gap-2 ${isExcluded ? 'opacity-40' : ''}`}>
                            <button
                              type="button"
                              onClick={() => isAdded ? removeAddedUser(row.serviceId, userId) : toggleExclude(row.serviceId, userId)}
                              className="text-muted-foreground hover:text-destructive text-xs leading-none w-4 h-4 flex items-center justify-center flex-shrink-0 transition-colors"
                              title={isAdded ? 'Remove' : isExcluded ? 'Re-include' : 'Exclude from pay'}
                            >
                              {!isAdded && isExcluded ? '+' : '×'}
                            </button>

                            <span className={`text-sm font-medium w-28 truncate flex-shrink-0 ${isExcluded ? 'line-through' : ''}`}>
                              {displayName}
                              {isAdded && <span className="text-[9px] text-muted-foreground ml-1 font-normal">added</span>}
                            </span>

                            {!isExcluded && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  placeholder={String(defaultSplit)}
                                  value={overrideVal ?? ''}
                                  onChange={(e) => setSplitOverride(row.serviceId, userId, e.target.value)}
                                  className="w-14 h-6 text-xs text-right border border-input rounded px-1.5 bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                                  title="Split %"
                                />
                                <span className="text-muted-foreground text-xs">%</span>
                                {deductionPct > 0 && (
                                  <span className="text-xs text-muted-foreground bg-muted rounded px-1 py-px">
                                    −{deductionPct}%
                                  </span>
                                )}
                              </div>
                            )}

                            {compA && (
                              <span className="ml-auto text-sm font-medium tabular-nums text-right min-w-[52px]">
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
                      }

                      return (
                        <div className="space-y-1.5">
                          {row.assignments.length === 0 && rowAdded.length === 0 && (
                            <span className="text-muted-foreground text-xs">Unassigned</span>
                          )}
                          {row.assignments.map((a) =>
                            renderPersonRow(a.userId, a.displayName, a.deductionPct, false)
                          )}
                          {rowAdded.map((u) =>
                            renderPersonRow(u.userId, u.displayName, u.deductionPct, true)
                          )}
                          {!splitsValid && computed.length > 0 && (
                            <p className="text-[10px] text-amber-600">splits don&apos;t add to 100%</p>
                          )}
                          {isOwnerOrManager && availableToAdd.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => { if (e.target.value) addPersonToRow(row.serviceId, e.target.value) }}
                              className="mt-1 text-xs h-6 border border-dashed border-input rounded px-1.5 text-muted-foreground bg-background cursor-pointer hover:border-primary transition-colors"
                            >
                              <option value="">+ Add person</option>
                              {availableToAdd.map((e) => (
                                <option key={e.id} value={e.id}>{e.displayName}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })()}
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground align-top pt-3">
                    {fmt(row.employeePool)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold align-top pt-3 text-sm">
                    {fmt(rowTotal)}
                  </td>
                  <td className="px-3 py-2.5 align-top pt-2">
                    {isOwnerOrManager ? (
                      <div className="flex justify-end">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">$</span>
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
                            className="w-20 h-7 text-xs pl-5 pr-1 tabular-nums"
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
              <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={4}>
                {rows.length} service{rows.length !== 1 ? 's' : ''}
                {grandTips > 0 && (
                  <span className="ml-2 text-muted-foreground/60">+ {fmt(grandTips)} tips</span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                {fmt(rows.reduce((s, r) => s + r.employeePool, 0))}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-sm">
                {fmt(grandTotal)}
              </td>
              <td className="px-3 py-2 text-right">
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

      {/* Sticky approve bar */}
      {isOwnerOrManager && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-lg border bg-card/95 backdrop-blur-sm px-4 py-3 shadow-md">
          <div>
            {approval ? (
              <>
                <p className="text-sm font-medium text-green-800">Payroll approved</p>
                <p className="text-xs text-green-700 mt-0.5">
                  By <span className="font-medium">{approval.byName}</span> ·{' '}
                  {approval.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Approve payroll</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Saves current splits and locks in pay for this period
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {approval && (
              <button
                onClick={handleUnapprove}
                disabled={unapprovePending}
                className="text-xs text-muted-foreground hover:text-destructive underline-offset-2 hover:underline transition-colors disabled:opacity-50"
              >
                {unapprovePending ? 'Unapproving…' : 'Unapprove'}
              </button>
            )}
            <Button
              size="sm"
              variant={approval ? 'outline' : 'default'}
              disabled={approvePending || rows.length === 0}
              onClick={handleApprove}
            >
              {approvePending ? 'Approving…' : approval ? 'Re-approve' : 'Approve payroll'}
            </Button>
          </div>
        </div>
      )}

      {/* Per-employee breakdown */}
      {employees.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">Per-employee breakdown</h2>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Employee</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => { setSelectedUserId(e.target.value); setShowPerEmployee(false) }}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.displayName}</option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={() => setShowPerEmployee(true)}>Calculate</Button>
            </div>

            {showPerEmployee && perEmpData && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  {selectedEmployee?.displayName} · {formatPeriodLabel(period)} · Payday {formatShortDate(period.payday)}
                </p>
                {perEmpData.services.length === 0 && perEmpData.salariedItems.length === 0 ? (
                  <div className="rounded-lg border bg-muted/20 p-6 text-center text-muted-foreground text-sm">
                    No completed services or salaried lines for this employee in this period.
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
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
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tip</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {perEmpData.services.map((s, idx) => (
                          <tr key={s.serviceId} className={`hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                            <td className="px-3 py-2 tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                              {fmtDate(s.serviceDate)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-sm">{s.customerName}</div>
                              <div className="text-xs text-muted-foreground">{s.serviceType}</div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-sm">{fmt(s.totalPrice)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">{s.serviceTypeShare}%</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-sm">{fmt(s.employeePool)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                              {s.splitPct.toFixed(1)}%
                              {s.deductionPct > 0 && (
                                <span className="text-red-500 ml-0.5">−{s.deductionPct}%</span>
                              )}
                              <span className="ml-1 font-medium text-foreground">= {s.effectivePct.toFixed(1)}%</span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-sm">{fmt(s.netPay)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                              {s.tipShare > 0 ? fmt(s.tipShare) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-sm">{fmt(s.totalPay)}</td>
                          </tr>
                        ))}
                        {/* Salaried lines */}
                        {perEmpData.salariedItems.map((l) => {
                          const amount = parseFloat(l.amount) || 0
                          const isApproved = l.status === 'approved'
                          const typeLabel = l.type === 'gm_salary' ? 'GM Salary' : 'Quality Bonus'
                          return (
                            <tr key={l.id} className="bg-blue-50/60 hover:bg-blue-50 transition-colors">
                              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">—</td>
                              <td className="px-3 py-2">
                                <div className="text-sm font-medium">{typeLabel}</div>
                                <div className="text-xs text-muted-foreground capitalize">{l.status}</div>
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                              <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                              <td className="px-3 py-2 text-right text-xs text-muted-foreground">—</td>
                              <td className="px-3 py-2 text-right text-xs text-muted-foreground">fixed</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium text-sm">
                                {isApproved ? fmt(amount) : <span className="text-muted-foreground text-xs">pending</span>}
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground text-xs">—</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-sm">
                                {isApproved ? fmt(amount) : <span className="text-muted-foreground text-xs">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/40 font-semibold text-sm">
                          <td className="px-3 py-2" colSpan={6}>Summary</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmt(perEmpData.summary.totalPay - perEmpData.summary.totalTips)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{fmt(perEmpData.summary.totalTips)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(perEmpData.summary.totalPay)}</td>
                        </tr>
                        {perEmpData.summary.salariedTotal > 0 && (
                          <tr className="border-t bg-blue-50/40 text-xs text-muted-foreground">
                            <td className="px-3 py-1.5" colSpan={8}>Includes {fmt(perEmpData.summary.salariedTotal)} in approved salaried lines</td>
                            <td />
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
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
  const [salariedLines, setSalariedLines] = useState<SalariedLine[]>([])

  const [tierEdits, setTierEdits] = useState<Record<string, string>>(
    Object.fromEntries(tierRows.map((r) => [r.tier, r.deductionPct]))
  )
  const [tierPending, startTierTransition] = useTransition()
  const [tierSaved, setTierSaved] = useState(false)

  // Load salaried lines when period changes
  useEffect(() => {
    let cancelled = false
    async function loadSalaried() {
      try {
        const mod = await import('./salaried-actions')
        const lines = await mod.getSalariedLinesForPeriod(period.startStr, period.endStr)
        if (!cancelled) setSalariedLines(lines)
      } catch {
        // salaried-actions not yet available — show empty
        if (!cancelled) setSalariedLines([])
      }
    }
    loadSalaried()
    return () => { cancelled = true }
  }, [period.startStr, period.endStr])

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

  return (
    <div className="space-y-6">
      {/* Period navigator — full-width prominent card */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-4 px-5 py-4">
          <Button variant="outline" size="sm" onClick={prevPeriod} disabled={period.index === 0} className="w-9 h-9 p-0 flex-shrink-0">
            ←
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Pay period</p>
            <p className="text-xl font-semibold tracking-tight leading-tight">{formatPeriodLabel(period)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={nextPeriod} className="w-9 h-9 p-0 flex-shrink-0">
            →
          </Button>
        </div>
        <div className="flex items-center gap-3 px-5 py-2.5 border-t bg-muted/20">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Payroll deadline</span>
            <span className="font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
              {formatShortDate(period.deadline)}
            </span>
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Payday</span>
            <span className="font-medium rounded-full bg-green-100 text-green-800 px-2 py-0.5">
              {formatShortDate(period.payday)}
            </span>
          </span>
        </div>
      </div>

      {/* Salaried automations */}
      <SalariedSection lines={salariedLines} />

      {/* Pay review */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pay review</h2>
        <PeriodReview
          key={period.startStr}
          period={period}
          employees={employees}
          tierRows={tierRows}
          isOwnerOrManager={isOwner || true}
          salariedLines={salariedLines}
        />
      </div>

      {/* Tier settings — owner only, collapsible */}
      {isOwner && (
        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium list-none hover:bg-muted/20 transition-colors rounded-lg">
            <span>Tier deduction settings</span>
            <span className="text-muted-foreground text-xs group-open:hidden">Show</span>
            <span className="text-muted-foreground text-xs hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-4 pb-4 pt-1 border-t space-y-3">
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
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">%</span>
                </div>
              </div>
            ))}
            <Button size="sm" onClick={saveTierConfig} disabled={tierPending} className="mt-1">
              {tierPending ? 'Saving…' : tierSaved ? 'Saved!' : 'Save tier config'}
            </Button>
          </div>
        </details>
      )}
    </div>
  )
}
