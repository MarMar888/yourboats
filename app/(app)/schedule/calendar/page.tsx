import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { services as servicesTable, customers, calendarEvents } from '@/lib/db/schema'
import { eq, asc, and, gte, lte, or } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { cn } from '@/lib/utils'
import { todayET } from '@/lib/date'
import { AddEventButton, DeleteEventButton } from './add-event-button'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMonthParam(param: string | undefined): { year: number; month: number } {
  if (param) {
    const match = param.match(/^(\d{4})-(\d{2})$/)
    if (match) {
      const year = parseInt(match[1], 10)
      const month = parseInt(match[2], 10) - 1 // 0-indexed
      if (month >= 0 && month <= 11) return { year, month }
    }
  }
  const [y, m] = todayET().split('-').map(Number)
  return { year: y, month: m - 1 }
}

function toMonthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const params = await searchParams
  const { year, month } = parseMonthParam(params.month)

  // Month bounds
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0) // last day of month
  const monthStartStr = toISODate(monthStart)
  const monthEndStr = toISODate(monthEnd)

  // Prev / next month params
  const prevDate = new Date(year, month - 1, 1)
  const nextDate = new Date(year, month + 1, 1)
  const prevMonthParam = toMonthParam(prevDate.getFullYear(), prevDate.getMonth())
  const nextMonthParam = toMonthParam(nextDate.getFullYear(), nextDate.getMonth())
  const currentMonthParam = toMonthParam(year, month)
  const todayMonthParam = (() => { const [ty, tm] = todayET().split('-').map(Number); return toMonthParam(ty, tm - 1) })()

  // ── Query services + calendar events in month ─────────────────────────────
  const eventRows = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        lte(calendarEvents.eventDate, monthEndStr),
        or(
          gte(calendarEvents.eventDate, monthStartStr),
          and(
            // multi-day events that started before month but end inside it
            lte(calendarEvents.eventDate, monthEndStr),
            gte(calendarEvents.endDate, monthStartStr)
          )
        )
      )
    )
    .orderBy(asc(calendarEvents.eventDate))

  const serviceRows = await db
    .select({
      id: servicesTable.id,
      serviceDate: servicesTable.serviceDate,
      status: servicesTable.status,
      customerName: customers.name,
    })
    .from(servicesTable)
    .innerJoin(customers, eq(servicesTable.customerId, customers.id))
    .where(
      and(
        gte(servicesTable.serviceDate, monthStartStr),
        lte(servicesTable.serviceDate, monthEndStr)
      )
    )
    .orderBy(asc(servicesTable.serviceDate))

  // ── Build calendar grid ────────────────────────────────────────────────────
  const todayStr = todayET()

  // Index services by date
  const byDate: Record<string, typeof serviceRows> = {}
  for (const svc of serviceRows) {
    if (!byDate[svc.serviceDate]) byDate[svc.serviceDate] = []
    byDate[svc.serviceDate].push(svc)
  }

  // Index events by date (each event appears on every day it spans)
  const eventsByDate: Record<string, typeof eventRows> = {}
  for (const ev of eventRows) {
    const start = ev.eventDate
    const end = ev.endDate ?? ev.eventDate
    // Walk each day in the span and attach the event
    let cur = new Date(start + 'T12:00:00Z')
    const endMs = new Date(end + 'T12:00:00Z').getTime()
    while (cur.getTime() <= endMs) {
      const ds = cur.toISOString().slice(0, 10)
      if (ds >= monthStartStr && ds <= monthEndStr) {
        if (!eventsByDate[ds]) eventsByDate[ds] = []
        eventsByDate[ds].push(ev)
      }
      cur = new Date(cur.getTime() + 86_400_000)
    }
  }

  // Days in month
  const daysInMonth = monthEnd.getDate()
  const firstDayOfWeek = monthStart.getDay() // 0=Sun

  type CalendarDay = {
    dateStr: string
    dayNum: number
    isToday: boolean
    services: typeof serviceRows
  }

  const days: CalendarDay[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const dateStr = toISODate(date)
    days.push({
      dateStr,
      dayNum: d,
      isToday: dateStr === todayStr,
      services: byDate[dateStr] ?? [],
    })
  }

  const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const STATUS_COLOR: Record<string, string> = {
    scheduled: 'bg-primary/10 text-primary hover:bg-primary/20',
    complete:  'bg-green-100 text-green-800 hover:bg-green-200',
    cancelled: 'bg-red-100 text-red-700 hover:bg-red-200 line-through opacity-60',
  }

  const EVENT_COLOR: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-800',
    green:  'bg-emerald-100 text-emerald-800',
    red:    'bg-rose-100 text-rose-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    purple: 'bg-purple-100 text-purple-800',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <div className="flex items-center gap-3">
          <AddEventButton />
          <Link
            href="/schedule"
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            ← Week view
          </Link>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/schedule/calendar?month=${prevMonthParam}`}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          ← Prev
        </Link>
        <span className="text-sm font-medium">{monthLabel}</span>
        <Link
          href={`/schedule/calendar?month=${nextMonthParam}`}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          Next →
        </Link>
        {currentMonthParam !== todayMonthParam && (
          <Link
            href="/schedule/calendar"
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Today
          </Link>
        )}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground text-center"
          >
            {d}
          </div>
        ))}

        {/* Leading blank cells */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`blank-${i}`} className="bg-card min-h-[80px] p-1.5" />
        ))}

        {/* Day cells */}
        {days.map((day) => {
          const dayEvents = eventsByDate[day.dateStr] ?? []
          return (
            <div
              key={day.dateStr}
              className={cn('bg-card min-h-[80px] p-1.5', day.isToday && 'bg-primary/5')}
            >
              <p
                className={cn(
                  'text-xs font-medium mb-1',
                  day.isToday ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {day.dayNum}
              </p>
              {day.services.map((svc) => (
                <Link
                  key={svc.id}
                  href={`/schedule/${svc.id}`}
                  className={cn(
                    'block truncate text-xs px-1.5 py-0.5 rounded mb-0.5 transition-colors',
                    STATUS_COLOR[svc.status] ?? 'bg-primary/10 text-primary hover:bg-primary/20'
                  )}
                >
                  {svc.customerName}
                </Link>
              ))}
              {dayEvents.map((ev) => (
                <div
                  key={ev.id + day.dateStr}
                  className={cn(
                    'group flex items-center gap-0.5 truncate text-xs px-1.5 py-0.5 rounded mb-0.5',
                    EVENT_COLOR[ev.color] ?? EVENT_COLOR.blue
                  )}
                >
                  <span className="truncate flex-1">{ev.title}</span>
                  {/* Only show delete on first day of multi-day event */}
                  {ev.eventDate === day.dateStr && (
                    <DeleteEventButton id={ev.id} />
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4">
        <span className="text-xs text-muted-foreground">Jobs:</span>
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary/10 inline-block" />
          Scheduled
        </span>
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-100 inline-block" />
          Complete
        </span>
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-100 inline-block" />
          Cancelled
        </span>
        <span className="text-xs text-muted-foreground ml-2">Events:</span>
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 inline-block" />
          Custom event
        </span>
      </div>
    </div>
  )
}
