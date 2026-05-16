// Pay period calendar anchored on the first period start (Saturday, May 9 2026).
// All periods are 14 days: Saturday → Friday.
// Payroll deadline: Monday after period end (end + 3 days).
// Payday:           Wednesday after period end (end + 5 days).

const ANCHOR_MS = Date.UTC(2026, 4, 9) // May 9 2026 00:00 UTC
const PERIOD_MS = 14 * 86_400_000

export type PayPeriod = {
  index: number
  start: Date   // Saturday
  end: Date     // Friday
  deadline: Date // Monday (submit payroll by)
  payday: Date  // Wednesday
  startStr: string // YYYY-MM-DD
  endStr: string
}

function addDays(base: number, n: number): Date {
  return new Date(base + n * 86_400_000)
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getPeriodByIndex(index: number): PayPeriod {
  const startMs = ANCHOR_MS + index * PERIOD_MS
  const start = new Date(startMs)
  const end = addDays(startMs, 13)
  return {
    index,
    start,
    end,
    deadline: addDays(startMs, 16), // end + 3
    payday:   addDays(startMs, 18), // end + 5
    startStr: toYMD(start),
    endStr:   toYMD(end),
  }
}

export function getCurrentPeriod(): PayPeriod {
  const nowMs = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  )
  const index = Math.max(0, Math.floor((nowMs - ANCHOR_MS) / PERIOD_MS))
  return getPeriodByIndex(index)
}

export function formatPeriodLabel(p: PayPeriod): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  return `${p.start.toLocaleDateString('en-US', opts)} – ${p.end.toLocaleDateString('en-US', opts)}`
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
