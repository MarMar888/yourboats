'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { saveTip, updateTierConfig, getLaborEntriesForPeriod, updatePayrollServiceType, getUnclockedBoatsForPeriod } from './actions'
import type { LaborTimeEntry, UnclockedBoat } from './actions'
import {
  savePayrollEntries, getPayrollForPeriod, approvePayrollForPeriod, unapprovePayrollForPeriod,
  deleteServicePayroll, deletePayrollEntry,
  getManualLinesForPeriod, createManualPayrollLine, updateManualPayrollLine, deleteManualPayrollLine, approveManualPayrollLine,
} from './payroll-actions'
import type { SavedPayrollRow, ManualLineRow } from './payroll-actions'
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
import { EmployeePayView } from './employee-pay-view'

type Employee = { id: string; displayName: string; tier: 'top' | 'mid' | 'low' | null; role?: 'owner' | 'manager' | 'employee' }
type TierRow = { tier: 'top' | 'mid' | 'low'; deductionPct: string }
type ServiceTypeShareOption = { serviceType: string; employeeSharePct: string }

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

function formatServiceTypeLabel(serviceType: string) {
  const labels: Record<string, string> = {
    recurring: 'Standard Clean',
    detailing: 'Detailing',
    buffing_waxing: 'Buffing & Waxing',
    acid_washing: 'Acid Washing',
    powerwashing: 'Powerwashing',
    gelcoat_wetsanding: 'Gelcoat Wet-Sanding',
    captaining: 'Captaining',
    other: 'Other',
  }
  return labels[serviceType] ?? serviceType
}

function fmtDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// ─── Salaried Section ─────────────────────────────────────────────────────────

function SalariedSection({ lines: propLines, isOwner }: { lines: SalariedLine[]; isOwner: boolean }) {
  const [lines, setLines] = useState(propLines)
  const [pending, startTransition] = useTransition()
  const [actionLineId, setActionLineId] = useState<string | null>(null)

  useEffect(() => { setLines(propLines) }, [propLines])

  function optimistic(id: string, patch: Partial<SalariedLine>) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  async function handleApprove(id: string) {
    setActionLineId(id)
    optimistic(id, { status: 'approved' })
    startTransition(async () => {
      try {
        const mod = await import('./salaried-actions')
        const result = await mod.approveSalariedLine(id)
        if (!result.ok) {
          toast.error(result.error ?? 'Failed to approve')
          setLines(propLines)
        }
      } catch {
        setLines(propLines)
      }
      setActionLineId(null)
    })
  }

  async function handleDeny(id: string) {
    setActionLineId(id)
    optimistic(id, { status: 'denied' })
    startTransition(async () => {
      try {
        const mod = await import('./salaried-actions')
        const result = await mod.denySalariedLine(id)
        if (!result.ok) {
          toast.error(result.error ?? 'Failed to deny')
          setLines(propLines)
        }
      } catch {
        setLines(propLines)
      }
      setActionLineId(null)
    })
  }

  async function handleRevert(id: string) {
    setActionLineId(id)
    optimistic(id, { status: 'pending', approvedByName: null, approvedAt: null })
    startTransition(async () => {
      try {
        const mod = await import('./salaried-actions')
        const result = await mod.revertSalariedLine(id)
        if (!result.ok) {
          toast.error(result.error ?? 'Failed to revert')
          setLines(propLines)
        }
      } catch {
        setLines(propLines)
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
                {isOwner && (line.status === 'approved' || line.status === 'denied') && (
                  <button
                    onClick={() => handleRevert(line.id)}
                    disabled={pending && actionLineId === line.id}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors disabled:opacity-50"
                  >
                    {pending && actionLineId === line.id ? 'Reverting…' : 'Revert'}
                  </button>
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
  serviceTypeShares,
  isOwnerOrManager,
  salariedLines,
}: {
  period: PayPeriod
  employees: Employee[]
  tierRows: TierRow[]
  serviceTypeShares: ServiceTypeShareOption[]
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
  // Revenue overrides: keyed by serviceId, stores raw input string for totalPrice
  const [revenueOverrides, setRevenueOverrides] = useState<Record<string, string>>({})
  // Manual lines
  const [manualLines, setManualLines] = useState<ManualLineRow[]>([])
  const [showAddManual, setShowAddManual] = useState(false)
  const [manualForm, setManualForm] = useState({ userId: '', description: '', amount: '' })
  const [manualPending, startManualTransition] = useTransition()
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ description: '', amount: '' })
  const [deletingService, setDeletingService] = useState<string | null>(null)
  const [savingServiceType, setSavingServiceType] = useState<Record<string, boolean>>({})
  const [serviceTypeErrors, setServiceTypeErrors] = useState<Record<string, string>>({})

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
    setShowAddManual(false)
    try {
      const [res, payrollRows, manualRows] = await Promise.all([
        fetch(`/api/pay/period?startDate=${period.startStr}&endDate=${period.endStr}`),
        getPayrollForPeriod(period.startStr, period.endStr).catch(() => [] as SavedPayrollRow[]),
        getManualLinesForPeriod(period.startStr, period.endStr).catch(() => [] as ManualLineRow[]),
      ])
      setManualLines(manualRows)
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
        const alreadyReconstructed = (reconstructedAdded[pr.serviceId] ?? [])
        if (svcRow &&
          !svcRow.assignments.some((a) => a.userId === pr.userId || a.displayName === pr.displayName) &&
          !alreadyReconstructed.some((a) => a.displayName === pr.displayName)
        ) {
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

      // Seed revenue overrides from the first saved payroll row per service
      const revOverrides: Record<string, string> = {}
      for (const pr of payrollRows) {
        if (pr.totalPrice && !revOverrides[pr.serviceId]) {
          revOverrides[pr.serviceId] = pr.totalPrice
        }
      }
      setRevenueOverrides(revOverrides)

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

  async function handleServiceTypeChange(serviceId: string, serviceType: string) {
    const option = serviceTypeShares.find((s) => s.serviceType === serviceType)
    if (!option) return

    const previous = rows.find((r) => r.serviceId === serviceId)
    setRows((prev) =>
      prev.map((r) =>
        r.serviceId === serviceId
          ? { ...r, serviceType, serviceTypeShare: Number(option.employeeSharePct) }
          : r
      )
    )
    setIsDirty(true)
    setServiceTypeErrors((prev) => {
      const next = { ...prev }
      delete next[serviceId]
      return next
    })
    setSavingServiceType((prev) => ({ ...prev, [serviceId]: true }))

    const result = await updatePayrollServiceType(serviceId, serviceType)
    setSavingServiceType((prev) => ({ ...prev, [serviceId]: false }))

    if (result.ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.serviceId === serviceId
            ? { ...r, serviceType, serviceTypeShare: result.serviceTypeShare }
            : r
        )
      )
      return
    }

    if (previous) {
      setRows((prev) => prev.map((r) => r.serviceId === serviceId ? previous : r))
    }
    setServiceTypeErrors((prev) => ({ ...prev, [serviceId]: result.error }))
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

  // Returns the effective employee pool for a row, accounting for revenue override.
  function effectivePool(row: PeriodServiceRow): number {
    const revRaw = revenueOverrides[row.serviceId]
    if (revRaw !== undefined && revRaw !== '') {
      const rev = parseFloat(revRaw)
      if (!isNaN(rev) && rev >= 0) return rev * (row.serviceTypeShare / 100)
    }
    return row.employeePool
  }

  function effectiveTotalPrice(row: PeriodServiceRow): number {
    const revRaw = revenueOverrides[row.serviceId]
    if (revRaw !== undefined && revRaw !== '') {
      const rev = parseFloat(revRaw)
      if (!isNaN(rev) && rev >= 0) return rev
    }
    return row.totalPrice
  }

  function computeAssignmentsFor(row: PeriodServiceRow): {
    assignments: (AssignmentRow & { effectiveSplitPct: number; computedNetPay: number })[]
    splitsValid: boolean
  } {
    const pool = effectivePool(row)
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
      const computedNetPay = pool * (effectivePct / 100)
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
      const totalPrice = effectiveTotalPrice(row)
      const pool = effectivePool(row)
      return computed.map((a) => ({
        serviceId:    row.serviceId,
        userId:       a.userId,
        displayName:  a.displayName,
        serviceDate:  row.serviceDate,
        serviceType:  row.serviceType,
        customerName: row.customerName,
        totalPrice,
        employeePool: pool,
        splitPct:     a.effectiveSplitPct,
        deductionPct: a.deductionPct,
        effectivePct: Math.max(0, a.effectiveSplitPct - a.deductionPct),
        netPay:       a.computedNetPay,
        tipShare:     tipPerPerson,
        totalPay:     a.computedNetPay + tipPerPerson,
      }))
    })
  }

  function setRevenueOverride(serviceId: string, value: string) {
    setIsDirty(true)
    setRevenueOverrides((prev) => ({ ...prev, [serviceId]: value }))
  }

  async function handleDeleteServicePayroll(serviceId: string) {
    setDeletingService(serviceId)
    try {
      await deleteServicePayroll(serviceId)
      // Remove from savedPayroll map
      setSavedPayroll((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((k) => {
          if (k.startsWith(`${serviceId}:`)) delete next[k]
        })
        return next
      })
    } finally {
      setDeletingService(null)
    }
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
        totalPrice: effectiveTotalPrice(row), serviceTypeShare: row.serviceTypeShare,
        employeePool: effectivePool(row), splitPct: a.effectiveSplitPct,
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
  const stalePayrollRows = Object.values(savedPayroll).filter((row) => row.staleAt)
  const staleServiceIds = new Set(stalePayrollRows.map((row) => row.serviceId))
  const staleServiceCount = staleServiceIds.size

  const perEmpData = showPerEmployee ? computePerEmployee(selectedUserId) : null
  const selectedEmployee = employees.find((e) => e.id === selectedUserId)

  return (
    <div className="space-y-4">
      {staleServiceCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            {staleServiceCount} approved payroll service{staleServiceCount === 1 ? '' : 's'} need review.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Service details changed after approval. Unapprove, review the updated rows, then approve again.
          </p>
        </div>
      )}

      {/* Pay review table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap w-24">Date</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-40">Client</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Boats</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">People & splits</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap w-28">Revenue</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap w-22">Pay</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Tip</th>
              <th className="px-3 py-2 w-8" />
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
              const revNum = parseFloat(revenueOverrides[row.serviceId] ?? String(row.totalPrice))
              const isRevModified = !isNaN(revNum) && Math.abs(revNum - row.totalPrice) > 0.005

              return (
                <tr key={row.serviceId} className={`align-top ${rowIdx % 2 === 1 ? 'bg-muted/10' : ''} hover:bg-muted/20 transition-colors`}>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground text-xs">
                    {fmtDate(row.serviceDate)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-sm leading-tight">{row.customerName}</div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {isOwnerOrManager ? (
                        <select
                          value={row.serviceType}
                          onChange={(e) => handleServiceTypeChange(row.serviceId, e.target.value)}
                          disabled={savingServiceType[row.serviceId]}
                          className="h-7 max-w-[150px] rounded border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          title="Service type for payroll percentage"
                        >
                          {!serviceTypeShares.some((s) => s.serviceType === row.serviceType) && (
                            <option value={row.serviceType}>{formatServiceTypeLabel(row.serviceType)}</option>
                          )}
                          {serviceTypeShares.map((s) => (
                            <option key={s.serviceType} value={s.serviceType}>
                              {formatServiceTypeLabel(s.serviceType)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{formatServiceTypeLabel(row.serviceType)}</span>
                      )}
                      <span className="text-[10px] bg-muted rounded px-1.5 py-px text-muted-foreground tabular-nums">
                        {row.serviceTypeShare}%
                      </span>
                      {staleServiceIds.has(row.serviceId) && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-px">
                          review
                        </span>
                      )}
                      {savingServiceType[row.serviceId] && (
                        <span className="text-[10px] text-muted-foreground">Saving…</span>
                      )}
                    </div>
                    {serviceTypeErrors[row.serviceId] && (
                      <div className="text-[10px] text-destructive mt-0.5">{serviceTypeErrors[row.serviceId]}</div>
                    )}
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

                  {/* Revenue — editable to override total price */}
                  <td className="px-3 py-2.5 align-top pt-2">
                    {isOwnerOrManager ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={revenueOverrides[row.serviceId] ?? String(row.totalPrice)}
                            onChange={(e) => setRevenueOverride(row.serviceId, e.target.value)}
                            className={`w-24 h-7 text-xs pl-5 pr-1 tabular-nums border rounded focus:outline-none focus:ring-1 text-right transition-colors ${
                              isRevModified
                                ? 'border-amber-400 bg-amber-50 focus:ring-amber-400'
                                : 'border-input bg-background focus:ring-ring'
                            }`}
                            title="Override revenue for pay calculation"
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          Pool: {fmt(effectivePool(row))}
                        </span>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{fmt(row.totalPrice)}</div>
                        <div className="text-[10px]">Pool: {fmt(row.employeePool)}</div>
                      </div>
                    )}
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
                  {/* Delete saved payroll for this service */}
                  <td className="px-1 py-2.5 align-top pt-3">
                    {isOwnerOrManager && Object.keys(savedPayroll).some((k) => k.startsWith(`${row.serviceId}:`)) && (
                      <button
                        onClick={() => handleDeleteServicePayroll(row.serviceId)}
                        disabled={deletingService === row.serviceId}
                        title="Delete saved payroll entries for this service"
                        className="text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-40 text-xs leading-none"
                      >
                        {deletingService === row.serviceId ? '…' : '🗑'}
                      </button>
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
                {fmt(rows.reduce((s, r) => s + effectivePool(r), 0))}
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
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Manual adjustment lines */}
      {isOwnerOrManager && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h2 className="text-sm font-semibold">Manual adjustments</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Bonuses, corrections, or off-system jobs</p>
            </div>
            {!showAddManual && (
              <button
                onClick={() => {
                  setManualForm({ userId: employees[0]?.id ?? '', description: '', amount: '' })
                  setShowAddManual(true)
                }}
                className="text-xs text-primary font-medium hover:underline underline-offset-2 transition-colors"
              >
                + Add line
              </button>
            )}
          </div>

          {/* Add form */}
          {showAddManual && (
            <div className="px-4 py-3 border-b bg-muted/20 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Employee</label>
                <select
                  value={manualForm.userId}
                  onChange={(e) => setManualForm((p) => ({ ...p, userId: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.displayName}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Detailing bonus"
                  value={manualForm.description}
                  onChange={(e) => setManualForm((p) => ({ ...p, description: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Amount</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm((p) => ({ ...p, amount: e.target.value }))}
                    className="h-8 w-28 rounded-md border border-input bg-background pl-6 pr-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={manualPending || !manualForm.description.trim() || !manualForm.amount}
                  onClick={() => {
                    const emp = employees.find((e) => e.id === manualForm.userId)
                    if (!emp) return
                    startManualTransition(async () => {
                      const result = await createManualPayrollLine({
                        userId:      emp.id,
                        displayName: emp.displayName,
                        periodStart: period.startStr,
                        periodEnd:   period.endStr,
                        description: manualForm.description,
                        amount:      parseFloat(manualForm.amount) || 0,
                      })
                      if (!result.error) {
                        const lines = await getManualLinesForPeriod(period.startStr, period.endStr)
                        setManualLines(lines)
                        setShowAddManual(false)
                        setManualForm({ userId: employees[0]?.id ?? '', description: '', amount: '' })
                      }
                    })
                  }}
                >
                  {manualPending ? 'Saving…' : 'Save'}
                </Button>
                <button
                  onClick={() => setShowAddManual(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Line list */}
          {manualLines.length === 0 && !showAddManual ? (
            <div className="px-4 py-5 text-sm text-muted-foreground/60 text-center">
              No manual lines for this period.
            </div>
          ) : manualLines.length > 0 ? (
            <div className="divide-y">
              {manualLines.map((line) => (
                <div key={line.id}>
                  {editingLineId === line.id ? (
                    <div className="px-4 py-3 flex flex-wrap items-end gap-3 bg-muted/20">
                      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                        <label className="text-xs font-medium text-muted-foreground">Description</label>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                          className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Amount</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                            className="h-8 w-28 rounded-md border border-input bg-background pl-6 pr-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={manualPending || !editForm.description.trim() || !editForm.amount}
                          onClick={() => {
                            startManualTransition(async () => {
                              const result = await updateManualPayrollLine(line.id, {
                                description: editForm.description,
                                amount: parseFloat(editForm.amount) || 0,
                              })
                              if (!result.error) {
                                const lines = await getManualLinesForPeriod(period.startStr, period.endStr)
                                setManualLines(lines)
                                setEditingLineId(null)
                              } else {
                                toast.error(result.error)
                              }
                            })
                          }}
                        >
                          {manualPending ? 'Saving…' : 'Save'}
                        </Button>
                        <button
                          onClick={() => setEditingLineId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{line.displayName}</span>
                          <span className="text-xs text-muted-foreground truncate">{line.description}</span>
                        </div>
                        <div className="text-sm font-semibold tabular-nums mt-0.5">{fmt(parseFloat(line.amount))}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {line.approvedAt ? (
                          <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                            ✓ Approved
                          </span>
                        ) : (
                          <>
                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              Draft
                            </span>
                            <button
                              onClick={() => {
                                setEditForm({ description: line.description, amount: line.amount })
                                setEditingLineId(line.id)
                              }}
                              disabled={manualPending}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                startManualTransition(async () => {
                                  await approveManualPayrollLine(line.id)
                                  const lines = await getManualLinesForPeriod(period.startStr, period.endStr)
                                  setManualLines(lines)
                                })
                              }}
                              disabled={manualPending}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-50"
                            >
                              Approve
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            startManualTransition(async () => {
                              await deleteManualPayrollLine(line.id)
                              setManualLines((prev) => prev.filter((l) => l.id !== line.id))
                            })
                          }}
                          disabled={manualPending}
                          title="Delete line"
                          className="text-muted-foreground/40 hover:text-destructive transition-colors text-xs disabled:opacity-40"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

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

// ─── Labor Analytics ─────────────────────────────────────────────────────────

type LaborDetailRow = {
  key: string          // serviceId-boatId-userId
  serviceId: string
  serviceDate: string
  customerName: string
  boatId: string
  boatNickname: string
  userId: string
  displayName: string
  hours: number
  attributedPay: number
  crewCount: number    // # of people assigned to the service
}

type BoatLaborStat = {
  boatId: string
  boatNickname: string
  totalHours: number
  attributedPay: number
  serviceCount: number
}

function LaborAnalytics({ period }: { period: PayPeriod }) {
  const [loading, setLoading] = useState(true)
  const [detailRows, setDetailRows] = useState<LaborDetailRow[]>([])
  const [boatStats, setBoatStats] = useState<BoatLaborStat[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [totalPay, setTotalPay] = useState(0)
  const [unclockedBoats, setUnclockedBoats] = useState<UnclockedBoat[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [laborEntries, periodRes, payrollRows, unclocked] = await Promise.all([
          getLaborEntriesForPeriod(period.startStr, period.endStr),
          fetch(`/api/pay/period?startDate=${period.startStr}&endDate=${period.endStr}`),
          getPayrollForPeriod(period.startStr, period.endStr),
          getUnclockedBoatsForPeriod(period.startStr, period.endStr),
        ])
        if (cancelled) return

        const rows: PeriodServiceRow[] = (await periodRes.json()).services ?? []

        // Build saved payroll map: "serviceId:userId" → totalPay
        const savedMap: Record<string, number> = {}
        for (const pr of payrollRows) {
          savedMap[`${pr.serviceId}:${pr.userId}`] = parseFloat(pr.totalPay) || 0
        }

        const detail: LaborDetailRow[] = []

        for (const row of rows) {
          const svcEntries = laborEntries.filter((e) => e.serviceId === row.serviceId)
          if (svcEntries.length === 0) continue

          const crewCount = row.assignments.length

          // Group: userId → boatId → total hours
          const byUser: Record<string, Record<string, number>> = {}
          for (const e of svcEntries) {
            if (!byUser[e.userId]) byUser[e.userId] = {}
            byUser[e.userId][e.boatId] = (byUser[e.userId][e.boatId] ?? 0) + e.hours
          }

          for (const [userId, boatHours] of Object.entries(byUser)) {
            const totalUserHours = Object.values(boatHours).reduce((s, h) => s + h, 0)
            if (totalUserHours === 0) continue

            // Resolve pay: prefer saved payroll, fall back to computed default split
            const savedKey = `${row.serviceId}:${userId}`
            let empPay: number
            if (savedMap[savedKey] !== undefined) {
              empPay = savedMap[savedKey]
            } else {
              const a = row.assignments.find((x) => x.userId === userId)
              if (!a) continue
              const tipNum = row.tipAmount ?? 0
              const tipShare = row.assignments.length > 0 ? tipNum / row.assignments.length : 0
              empPay = a.netPay + tipShare
            }

            // Prorate pay to each boat by that user's time fraction
            for (const [boatId, hoursOnBoat] of Object.entries(boatHours)) {
              const fraction = hoursOnBoat / totalUserHours
              const attributed = empPay * fraction
              const entry = svcEntries.find((e) => e.boatId === boatId && e.userId === userId)
              detail.push({
                key:          `${row.serviceId}-${boatId}-${userId}`,
                serviceId:    row.serviceId,
                serviceDate:  row.serviceDate,
                customerName: row.customerName,
                boatId,
                boatNickname: entry?.boatNickname ?? 'Unknown boat',
                userId,
                displayName:  entry?.displayName ?? '',
                hours:        hoursOnBoat,
                attributedPay: attributed,
                crewCount,
              })
            }
          }
        }

        // Sort: date asc, then boat name
        detail.sort((a, b) =>
          a.serviceDate.localeCompare(b.serviceDate) ||
          a.boatNickname.localeCompare(b.boatNickname)
        )

        // Aggregate per boat for summary table
        const boatWork: Record<string, {
          boatNickname: string; totalHours: number; attributedPay: number; serviceIds: Set<string>
        }> = {}
        for (const d of detail) {
          if (!boatWork[d.boatId]) {
            boatWork[d.boatId] = { boatNickname: d.boatNickname, totalHours: 0, attributedPay: 0, serviceIds: new Set() }
          }
          boatWork[d.boatId].totalHours += d.hours
          boatWork[d.boatId].attributedPay += d.attributedPay
          boatWork[d.boatId].serviceIds.add(d.serviceId)
        }
        const stats: BoatLaborStat[] = Object.entries(boatWork)
          .map(([boatId, d]) => ({
            boatId,
            boatNickname: d.boatNickname,
            totalHours: d.totalHours,
            attributedPay: d.attributedPay,
            serviceCount: d.serviceIds.size,
          }))
          .sort((a, b) => {
            const rA = a.totalHours > 0 ? a.attributedPay / a.totalHours : 0
            const rB = b.totalHours > 0 ? b.attributedPay / b.totalHours : 0
            return rB - rA
          })

        const tHours = detail.reduce((s, d) => s + d.hours, 0)
        const tPay   = detail.reduce((s, d) => s + d.attributedPay, 0)

        if (!cancelled) {
          setDetailRows(detail)
          setBoatStats(stats)
          setTotalHours(tHours)
          setTotalPay(tPay)
          setUnclockedBoats(unclocked)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [period.startStr, period.endStr])

  const periodRate = totalHours > 0 ? totalPay / totalHours : 0

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (detailRows.length === 0 && unclockedBoats.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        No clocked time found for this pay period.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {detailRows.length > 0 && (
      <>
      {/* Period summary */}
      <div className="rounded-lg border bg-card grid grid-cols-3 divide-x">
        <div className="px-5 py-4">
          <p className="text-xs text-muted-foreground">Total hours clocked</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            {totalHours.toFixed(1)}
            <span className="text-sm font-normal text-muted-foreground ml-1">hrs</span>
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-muted-foreground">Total employee pay</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{fmt(totalPay)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-muted-foreground">Effective rate (period)</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            {fmt(periodRate)}
            <span className="text-sm font-normal text-muted-foreground ml-1">/hr</span>
          </p>
        </div>
      </div>

      {/* Detail breakdown — one row per cleaner per boat per service */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Detail breakdown</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            One row per cleaner per boat. Pay is prorated by time fraction.
            Boats without clocked time are excluded.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Boat</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Client</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Cleaner</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap" title="People assigned to the service">Crew</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Hours</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Pay attr.</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">$/hr</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {detailRows.map((d, i) => {
                const rate = d.hours > 0 ? d.attributedPay / d.hours : 0
                return (
                  <tr key={d.key} className={`hover:bg-muted/20 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                      {fmtDate(d.serviceDate)}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{d.boatNickname}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{d.customerName}</td>
                    <td className="px-3 py-2.5">{d.displayName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-xs" title="Assigned crew size">
                      {d.crewCount}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{d.hours.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(d.attributedPay)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmt(rate)}/hr</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 text-sm font-semibold">
                <td className="px-3 py-2 text-muted-foreground font-normal" colSpan={4}>
                  {detailRows.length} row{detailRows.length !== 1 ? 's' : ''}
                </td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{totalHours.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalPay)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(periodRate)}/hr</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      </>
      )}

      {/* Boats paid but no clock-ins */}
      {unclockedBoats.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200">
            <h2 className="text-sm font-semibold text-amber-900">Boats paid — no clock-ins</h2>
            <p className="text-xs text-amber-700 mt-0.5">
              These boats appear on a paid service but nobody clocked in for them.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 bg-amber-100/60 text-xs">
                  <th className="px-3 py-2 text-left font-medium text-amber-800 whitespace-nowrap">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-amber-800">Boat</th>
                  <th className="px-3 py-2 text-left font-medium text-amber-800">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {unclockedBoats.map((b, i) => (
                  <tr key={`${b.serviceId}-${b.boatId}`} className={`hover:bg-amber-100/50 transition-colors ${i % 2 === 1 ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-xs text-amber-700">
                      {fmtDate(b.serviceDate)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-amber-900">{b.boatNickname}</td>
                    <td className="px-3 py-2.5 text-amber-800">{b.customerName}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-amber-200 bg-amber-100/60 text-xs text-amber-700">
                  <td className="px-3 py-2" colSpan={3}>
                    {unclockedBoats.length} boat{unclockedBoats.length !== 1 ? 's' : ''} across{' '}
                    {new Set(unclockedBoats.map((b) => b.serviceId)).size} service{new Set(unclockedBoats.map((b) => b.serviceId)).size !== 1 ? 's' : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Per-boat summary */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">By boat</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Boat</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Services</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Hours</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Pay attributed</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Effective $/hr</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {boatStats.map((b, i) => {
              const rate = b.totalHours > 0 ? b.attributedPay / b.totalHours : 0
              return (
                <tr key={b.boatId} className={`hover:bg-muted/20 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-4 py-2.5 font-medium">{b.boatNickname}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{b.serviceCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.totalHours.toFixed(1)} hrs</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(b.attributedPay)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(rate)}/hr</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40 text-sm font-semibold">
              <td className="px-4 py-2 text-muted-foreground font-normal">{boatStats.length} boat{boatStats.length !== 1 ? 's' : ''}</td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums">{totalHours.toFixed(1)} hrs</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt(totalPay)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmt(periodRate)}/hr</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function PayClient({
  employees,
  tierRows,
  serviceTypeShares,
  isOwner,
}: {
  employees: Employee[]
  tierRows: TierRow[]
  serviceTypeShares: ServiceTypeShareOption[]
  isOwner: boolean
}) {
  const [period, setPeriod] = useState<PayPeriod>(getCurrentPeriod)
  const [activeTab, setActiveTab] = useState<'pay-review' | 'employee-view' | 'labor-analytics'>('pay-review')
  const [salariedLines, setSalariedLines] = useState<SalariedLine[]>([])
  const employeeViewOptions = employees.some((e) => e.role)
    ? employees.filter((e) => e.role === 'employee')
    : employees
  const [previewUserId, setPreviewUserId] = useState(employeeViewOptions[0]?.id ?? '')

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

      {/* Tab switcher — employee preview and labor analytics are owner-only */}
      <div className="flex gap-0 border-b -mb-2">
        {(['pay-review', ...(isOwner ? ['employee-view', 'labor-analytics'] : [])] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            }`}
          >
            {tab === 'pay-review' ? 'Pay review' : tab === 'employee-view' ? 'Employee view' : 'Labor analytics'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'pay-review' && (
        <>
          {/* Salaried automations */}
          <SalariedSection lines={salariedLines} isOwner={isOwner} />

          {/* Pay review */}
          <PeriodReview
            key={period.startStr}
            period={period}
            employees={employees}
            tierRows={tierRows}
            serviceTypeShares={serviceTypeShares}
            isOwnerOrManager={isOwner || true}
            salariedLines={salariedLines}
          />
        </>
      )}

      {activeTab === 'employee-view' && isOwner && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card px-4 py-3">
            <label className="text-xs font-medium text-muted-foreground">View as employee</label>
            <select
              value={previewUserId}
              onChange={(e) => setPreviewUserId(e.target.value)}
              className="mt-1 h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
            >
              {employeeViewOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.displayName}</option>
              ))}
            </select>
          </div>

          {previewUserId ? (
            <EmployeePayView
              key={previewUserId}
              viewedUserId={previewUserId}
              viewedEmployeeName={employeeViewOptions.find((e) => e.id === previewUserId)?.displayName}
            />
          ) : (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              No employees are available to preview.
            </div>
          )}
        </div>
      )}

      {activeTab === 'labor-analytics' && isOwner && (
        <LaborAnalytics key={period.startStr} period={period} />
      )}

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
