'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { updateRecurringSchedule, regenerateRecurringServices } from './recurring-schedule-actions'
import type { UpdateScheduleInput } from './recurring-schedule-actions'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export type RecurringScheduleRow = {
  id: string
  serviceType: string
  frequencyWeeks: number
  dayOfWeek: number
  startDate: string
  endDate: string
  active: boolean
  futureCount: number  // # of future scheduled services still tied to this schedule
}

function EditScheduleModal({
  schedule,
  open,
  onOpenChange,
}: {
  schedule: RecurringScheduleRow
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
    // Save first, then regenerate
    const input: UpdateScheduleInput = {
      scheduleId: schedule.id,
      serviceType,
      frequencyWeeks: Number(frequencyWeeks),
      dayOfWeek: Number(dayOfWeek),
      startDate,
      endDate,
      active,
    }
    startRegen(async () => {
      const saveResult = await updateRecurringSchedule(input)
      if (saveResult.error) { setError(saveResult.error); return }
      const regenResult = await regenerateRecurringServices(schedule.id)
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
      <DialogContent className="max-w-md">
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

          {error && <p className="text-sm text-destructive">{error}</p>}
          {regenMsg && <p className="text-sm text-green-600">{regenMsg}</p>}

          {schedule.futureCount > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <strong>{schedule.futureCount}</strong> future service{schedule.futureCount !== 1 ? 's are' : ' is'} scheduled from this rule.
              Saving only updates the record — use <strong>"Save & regenerate"</strong> to delete
              those services and recreate them using the new settings.
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

export function RecurringScheduleList({
  schedules,
  canManage,
}: {
  schedules: RecurringScheduleRow[]
  canManage: boolean
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
          open={editingId !== null}
          onOpenChange={(v) => { if (!v) setEditingId(null) }}
        />
      )}
    </>
  )
}
