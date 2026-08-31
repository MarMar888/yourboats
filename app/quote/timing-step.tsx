'use client'

import { Label } from '@/components/ui/label'
import { DatePicker, formatShortDate, toDateStr } from './date-picker'

const PRESETS: { label: string; days: number | null }[] = [
  { label: 'ASAP', days: 3 },
  { label: 'This week', days: 7 },
  { label: 'This month', days: 30 },
  { label: "I'm flexible", days: null },
]

function todayStr(): string {
  return toDateStr(new Date())
}

function addDaysStr(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

export function TimingStep({
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
}: {
  startDate: string
  onStartDateChange: (v: string) => void
  endDate: string
  onEndDateChange: (v: string) => void
}) {
  const min = todayStr()

  function applyPreset(days: number | null) {
    if (days === null) {
      onStartDateChange('')
      onEndDateChange('')
      return
    }
    onStartDateChange(min)
    onEndDateChange(addDaysStr(days))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">When works for you?</h2>
        <p className="text-sm text-muted-foreground">
          Give us a date range and we&apos;ll find a slot that fits. Totally optional.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.days)}
            className="rounded-lg border border-border px-3 py-2.5 text-center text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="q-start-date">Earliest date</Label>
          <DatePicker id="q-start-date" value={startDate} onChange={onStartDateChange} min={min} placeholder="Any date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-end-date">Latest date</Label>
          <DatePicker
            id="q-end-date"
            value={endDate}
            onChange={onEndDateChange}
            min={startDate || min}
            placeholder="Any date"
          />
        </div>
      </div>

      {startDate && (
        <p className="text-xs text-muted-foreground">
          We&apos;ll aim to schedule between {formatShortDate(startDate)}
          {endDate && endDate !== startDate ? ` and ${formatShortDate(endDate)}` : ''}.
        </p>
      )}
    </div>
  )
}
