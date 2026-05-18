'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { updateRecurringSchedule, regenerateRecurringServices } from './recurring-schedule-actions'
import type { UpdateScheduleInput, RegenBoatRow } from './recurring-schedule-actions'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export type CustomerBoat = {
  id: string
  nickname: string
  lengthFt: number | null
}

export type RecurringScheduleRow = {
  id: string
  serviceType: string
  frequencyWeeks: number
  dayOfWeek: number
  startDate: string
  endDate: string
  active: boolean
  futureCount: number
  existingBoats: { boatId: string; rateType: 'per_ft' | 'flat'; rate: string | null }[]
}

// ─── Boat picker ──────────────────────────────────────────────────────────────

type BoatConfig = {
  boatId: string
  rateType: 'per_ft' | 'flat'
  rate: string
}

function BoatPicker({
  customerBoats,
  value,
  onChange,
}: {
  customerBoats: CustomerBoat[]
  value: BoatConfig[]
  onChange: (v: BoatConfig[]) => void
}) {
  if (customerBoats.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No boats on file for this customer.</p>
    )
  }

  function toggle(boatId: string) {
    const existing = value.find((b) => b.boatId === boatId)
    if (existing) {
      onChange(value.filter((b) => b.boatId !== boatId))
    } else {
      onChange([...value, { boatId, rateType: 'per_ft', rate: '' }])
    }
  }

  function update(boatId: string, field: 'rateType' | 'rate', val: string) {
    onChange(value.map((b) =>
      b.boatId === boatId
        ? { ...b, [field]: field === 'rateType' ? (val as 'per_ft' | 'flat') : val }
        : b
    ))
  }

  return (
    <div className="space-y-2">
      {customerBoats.map((boat) => {
        const config = value.find((b) => b.boatId === boat.id)
        const checked = !!config
        return (
          <div key={boat.id} className={cn(
            'rounded-md border px-3 py-2 transition-colors',
            checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'
          )}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(boat.id)}
                className="rounded border-input"
              />
              <span className="text-sm font-medium">{boat.nickname}</span>
              {boat.lengthFt && (
                <span className="text-xs text-muted-foreground">· {boat.lengthFt} ft</span>
              )}
            </label>

            {checked && config && (
              <div className="mt-2 flex gap-2 pl-5">
                <select
                  value={config.rateType}
                  onChange={(e) => update(boat.id, 'rateType', e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="per_ft">$/ft</option>
                  <option value="flat">Flat</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Rate"
                  value={config.rate}
                  onChange={(e) => update(boat.id, 'rate', e.target.value)}
                  className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {config.rateType === 'per_ft' && boat.lengthFt && config.rate && (
                  <span className="text-xs text-muted-foreground self-center tabular-nums">
                    = ${(Number(config.rate) * boat.lengthFt).toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditScheduleModal({
  schedule,
  customerBoats,
  open,
  onOpenChange,
}: {
  schedule: RecurringScheduleRow
  customerBoats: CustomerBoat[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [serviceType, setServiceType] = useState(schedule.serviceType)
  const [frequencyWeeks, setFrequencyWeeks] = useState(String(schedule.frequencyWeeks))
  const [dayOfWeek, setDayOfWeek] = useState(String(schedule.dayOfWeek))
  const [startDate, setStartDate] = useState(schedule.startDate)
  const [endDate, setEndDate] = useState(schedule.endDate)
  const [active, setActive] = useState(schedule.active)
  const [error, setError] = useState('')
  const [regenMsg, setRegenMsg] = useState('')

  // Pre-populate boat picker from existing service config
  const [boatConfigs, setBoatConfigs] = useState<BoatConfig[]>(() =>
    schedule.existingBoats.map((b) => ({
      boatId: b.boatId,
      rateType: b.rateType,
      rate: b.rate ?? '',
    }))
  )

  const [savePending, startSave] = useTransition()
  const [regenPending, startRegen] = useTransition()

  const handleSave = () => {
    setError('')
    setRegenMsg('')
    const input: UpdateScheduleInput = {
      scheduleId: schedule.id,
      serviceType,
      frequencyWeeks: Number(frequencyWeeks),
      dayOfWeek: Number(dayOfWeek),
      startDate,
      endDate,
      active,
    }
    startSave(async () => {
      const result = await updateRecurringSchedule(input)
      if (result.error) {
        setError(result.error)
      } else {
        onOpenChange(false)
      }
    })
  }

  const handleRegenerate = () => {
    setError('')
    setRegenMsg('')
    const input: UpdateScheduleInput = {
      scheduleId: schedule.id,
      serviceType,
      frequencyWeeks: Number(frequencyWeeks),
      dayOfWeek: Number(dayOfWeek),
      startDate,
      endDate,
      active,
    }
    const boats: RegenBoatRow[] = boatConfigs.map((b) => ({
      boatId: b.boatId,
      rateType: b.rateType,
      rate: b.rate || null,
    }))
    startRegen(async () => {
      const saveResult = await updateRecurringSchedule(input)
      if (saveResult.error) { setError(saveResult.error); return }
      const regenResult = await regenerateRecurringServices(schedule.id, boats)
      if (regenResult.error) {
        setError(regenResult.error)
      } else {
        setRegenMsg(`Done — ${regenResult.created} future services recreated.`)
        setTimeout(() => onOpenChange(false), 1500)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit recurring schedule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Service type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Service type
            </label>
            <input
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Frequency
            </label>
            <select
              value={frequencyWeeks}
              onChange={(e) => setFrequencyWeeks(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="1">Every week</option>
              <option value="2">Every 2 weeks</option>
              <option value="3">Every 3 weeks</option>
              <option value="4">Every 4 weeks</option>
            </select>
          </div>

          {/* Day of week */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Day of week
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DAY_NAMES.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                End date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-sm">Active</span>
          </label>

          {/* Boats — used when regenerating */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Boats for regenerated services
            </label>
            <p className="text-xs text-muted-foreground">
              Select which boats to include on each recreated service.
            </p>
            <BoatPicker
              customerBoats={customerBoats}
              value={boatConfigs}
              onChange={setBoatConfigs}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {regenMsg && <p className="text-sm text-green-600">{regenMsg}</p>}

          {schedule.futureCount > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <strong>{schedule.futureCount}</strong> future service{schedule.futureCount !== 1 ? 's are' : ' is'} scheduled from this rule.
              Saving only updates the record — use <strong>"Save & regenerate"</strong> to delete
              those services and recreate them with the new settings and boats.
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savePending || regenPending}>
            Cancel
          </Button>
          {schedule.futureCount > 0 && (
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={savePending || regenPending}
              className="border-amber-300 text-amber-800 hover:bg-amber-50"
            >
              {regenPending ? 'Regenerating…' : 'Save & regenerate'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={savePending || regenPending}>
            {savePending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function RecurringScheduleList({
  schedules,
  canManage,
  boats,
}: {
  schedules: RecurringScheduleRow[]
  canManage: boolean
  boats: CustomerBoat[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = schedules.find((s) => s.id === editingId)

  if (schedules.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
        No recurring schedules.
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border bg-card divide-y">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{s.serviceType}</span>
                {!s.active && (
                  <Badge variant="secondary" className="text-xs">Inactive</Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                Every {s.frequencyWeeks === 1 ? 'week' : `${s.frequencyWeeks} weeks`} on {DAY_NAMES[s.dayOfWeek]}
              </p>
              <p className="text-muted-foreground text-xs">
                {fmtDate(s.startDate)} → {fmtDate(s.endDate)}
              </p>
              {s.futureCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {s.futureCount} upcoming service{s.futureCount !== 1 ? 's' : ''} queued
                </p>
              )}
            </div>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setEditingId(s.id)}
              >
                Edit
              </Button>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <EditScheduleModal
          schedule={editing}
          customerBoats={boats}
          open={editingId !== null}
          onOpenChange={(v) => { if (!v) setEditingId(null) }}
        />
      )}
    </>
  )
}
