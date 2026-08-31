'use client'

import { useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateStr(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function formatDisplay(s: string): string {
  const d = parseDateStr(s)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatShortDate(s: string): string {
  const d = parseDateStr(s)
  if (!d) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Local-time day grid for a given month; leading/trailing nulls pad the
// first/last week so every row has 7 cells.
function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = 'Select a date',
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  min?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = parseDateStr(value)
  const minDate = min ? parseDateStr(min) : null
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewDate, setViewDate] = useState(() => selected ?? minDate ?? today)
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const rows = buildMonthGrid(year, month)

  function isDisabled(day: number): boolean {
    if (!minDate) return false
    const d = new Date(year, month, day)
    return d < minDate
  }

  function isSelected(day: number): boolean {
    return !!selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day
  }

  function isToday(day: number): boolean {
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  }

  function changeMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1))
  }

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        onClick={() => {
          // Re-anchor the visible month to the current selection/min every
          // time the calendar opens, so a min that changed while it was
          // closed (e.g. picking "Earliest date" first) doesn't leave
          // "Latest date" opening on a month that's entirely disabled.
          setViewDate(selected ?? minDate ?? today)
          setOpen((o) => !o)
        }}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-foreground/[0.03] transition-colors focus-visible:border-primary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1"
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={cn(value ? 'text-foreground' : 'text-muted-foreground')}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1.5 w-72 rounded-md border bg-card p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-sm font-semibold">
                {MONTH_LABELS[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w} className="text-[11px] font-medium text-muted-foreground">
                  {w}
                </span>
              ))}
              {rows.map((row, i) =>
                row.map((day, j) => {
                  if (day === null) return <span key={`${i}-${j}`} />
                  const disabled = isDisabled(day)
                  return (
                    <button
                      key={`${i}-${j}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onChange(toDateStr(new Date(year, month, day)))
                        setOpen(false)
                      }}
                      className={cn(
                        'mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
                        disabled && 'cursor-not-allowed text-muted-foreground/40',
                        !disabled && !isSelected(day) && 'hover:bg-muted',
                        isSelected(day) && 'bg-primary font-semibold text-primary-foreground',
                        !isSelected(day) && isToday(day) && 'font-semibold text-primary ring-1 ring-inset ring-primary/40'
                      )}
                    >
                      {day}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
