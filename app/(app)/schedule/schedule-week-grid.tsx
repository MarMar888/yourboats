'use client'

import { useEffect, useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import ScheduleCard from './schedule-card'
import type { ScheduleCardEmployee, ReminderStatus } from './schedule-card'
import { rescheduleService, markComplete, deleteService } from './actions'
import { CompletionPhotoModal } from './completion-photo-modal'

export type GridCardData = {
  id: string
  serviceDate: string
  serviceType: string      // display label
  status: string
  totalPrice: string | null
  notes: string | null
  customerNotes: string | null
  customerAddress: string | null
  approvedAt: Date | null
  reminderStatus: ReminderStatus
  reminderSentAt: Date | null
  completionPhotoUrl: string | null
  customerId: string
  customerName: string
  boats: { boatId: string; nickname: string; boatNotes: string | null; serviceBoatNotes: string | null; assignedIds: string[] }[]
}

export type WeatherDay = {
  tempMaxF: number
  precipPct: number
  windMph: number
  hourlyRainPct?: number[]
}

export type GridDayData = {
  dateStr: string
  dayLabel: string   // "Mon"
  dateLabel: string  // "May 19"
  isToday: boolean
  weather?: WeatherDay
  cards: GridCardData[]
}

interface Props {
  days: GridDayData[]
  employees: ScheduleCardEmployee[]
  isManager: boolean
}

const HOUR_LABELS = ['7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p']

function WeatherBadge({ weather }: { weather: WeatherDay }) {
  const [open, setOpen] = useState(false)
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hourly = weather.hourlyRainPct
  const hasHourly = hourly && hourly.length === 13

  const showTooltip = () => {
    if (!hasHourly) return
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }

  const hideTooltip = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(false)
    setHoveredHour(null)
  }

  const queueHideTooltip = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      hideTooltip()
      closeTimer.current = null
    }, 180)
  }

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      hideTooltip()
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className="relative inline-flex items-center"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') showTooltip()
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') queueHideTooltip()
      }}
    >
      <button
        type="button"
        className={cn(
          'max-w-full cursor-default select-none truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          hasHourly && 'cursor-pointer',
          weather.precipPct >= 60 ? 'border-sky-200 bg-sky-50 text-sky-700'
            : weather.precipPct >= 30 ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-border bg-card text-muted-foreground'
        )}
        aria-expanded={hasHourly ? open : undefined}
        aria-label="Show hourly rain chance"
        onClick={() => {
          if (!hasHourly) return
          setOpen((current) => !current)
        }}
      >
        {weather.precipPct >= 60 ? 'Rain' : weather.precipPct >= 30 ? 'Risk' : 'Clear'}{' '}
        {weather.tempMaxF}° · {weather.precipPct}% · {weather.windMph} mph
      </button>

      {open && hasHourly && (
        <div
          className="fixed inset-x-3 top-20 z-50 sm:absolute sm:inset-auto sm:left-0 sm:top-[calc(100%+6px)] sm:before:absolute sm:before:-top-2 sm:before:left-0 sm:before:h-2 sm:before:w-full sm:before:content-['']"
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') showTooltip()
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') queueHideTooltip()
          }}
        >
          <div className="w-full rounded-lg border border-border/80 bg-card p-4 shadow-[0_18px_46px_hsl(var(--foreground)/0.16)] sm:w-[310px]">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="text-[12px] font-semibold text-foreground">Hourly rain chance</span>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground text-right">
                <span className="whitespace-nowrap">{weather.tempMaxF}°F high</span>
                <span className="hidden min-[360px]:inline">·</span>
                <span className="whitespace-nowrap">{weather.windMph} mph wind</span>
                <button
                  type="button"
                  className="-mr-1 ml-1 rounded-md px-1.5 py-0.5 text-[13px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label="Close hourly rain chance"
                  onClick={hideTooltip}
                >
                  x
                </button>
              </div>
            </div>

            {/* Bar chart */}
            <div className="flex items-end gap-[3px] sm:h-16 h-20">
              {hourly!.map((pct, i) => {
                const barH = `max(3px, ${pct}%)`
                const isHovered = hoveredHour === i
                const isDimmed = hoveredHour !== null && !isHovered
                return (
                  <div
                    key={i}
                    className="relative flex-1 h-full flex flex-col justify-end cursor-default"
                    onPointerEnter={() => setHoveredHour(i)}
                    onPointerLeave={() => setHoveredHour(null)}
                    onClick={() => setHoveredHour(isHovered ? null : i)}
                  >
                    {/* Rail */}
                    <div className="absolute inset-0 rounded-sm bg-muted" />
                    {/* Bar */}
                    <div
                      className={cn(
                        'relative rounded-sm transition-opacity duration-75',
                        isDimmed ? 'opacity-30' : 'opacity-100',
                        pct >= 60 ? 'bg-sky-600' : pct >= 30 ? 'bg-amber-400' : 'bg-sky-300'
                      )}
                      style={{ height: barH }}
                    />
                    {/* Hover label */}
                    {isHovered && (
                      <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-1 text-[10px] font-semibold text-background shadow-sm pointer-events-none">
                        <span className="mr-0.5 text-background/60">{HOUR_LABELS[i]}</span> {pct}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Hour labels */}
            <div className="flex gap-[3px] mt-2">
              {HOUR_LABELS.map((label, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex-1 text-center text-[8.5px] leading-none transition-colors',
                    hoveredHour === i ? 'text-foreground font-semibold' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ScheduleWeekGrid({ days: initialDays, employees, isManager }: Props) {
  const router = useRouter()
  const [days, setDays] = useState(initialDays)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overDate, setOverDate] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const dragSourceDate = useRef<string | null>(null)

  // Photo modal state
  const [photoModalFor, setPhotoModalFor] = useState<{ id: string; customerName: string } | null>(null)

  function finishComplete(serviceId: string) {
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        cards: day.cards.map((c) => c.id === serviceId ? { ...c, status: 'complete' } : c),
      }))
    )
    startTransition(async () => {
      await markComplete(serviceId)
      router.refresh()
    })
  }

  function handleComplete(serviceId: string) {
    const card = days.flatMap((d) => d.cards).find((c) => c.id === serviceId)
    setPhotoModalFor({ id: serviceId, customerName: card?.customerName ?? '' })
  }

  function handleDelete(serviceId: string) {
    setDays((prev) =>
      prev.map((day) => ({ ...day, cards: day.cards.filter((c) => c.id !== serviceId) }))
    )
    startTransition(async () => {
      await deleteService(serviceId)
      router.refresh()
    })
  }

  function handleDragStart(cardId: string, fromDate: string) {
    setDraggingId(cardId)
    dragSourceDate.current = fromDate
  }

  function handleDragEnd() {
    setDraggingId(null)
    setOverDate(null)
    dragSourceDate.current = null
  }

  function handleDragOver(e: React.DragEvent, dateStr: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverDate(dateStr)
  }

  function handleDrop(e: React.DragEvent, targetDate: string) {
    e.preventDefault()
    const cardId = draggingId
    const sourceDate = dragSourceDate.current
    setDraggingId(null)
    setOverDate(null)
    dragSourceDate.current = null

    if (!cardId || !sourceDate || sourceDate === targetDate) return

    // Optimistic update
    setDays((prev) => {
      const next = prev.map((day) => ({ ...day, cards: [...day.cards] }))
      const srcDay = next.find((d) => d.dateStr === sourceDate)
      const tgtDay = next.find((d) => d.dateStr === targetDate)
      if (!srcDay || !tgtDay) return prev
      const idx = srcDay.cards.findIndex((c) => c.id === cardId)
      if (idx === -1) return prev
      const [card] = srcDay.cards.splice(idx, 1)
      tgtDay.cards.push({ ...card, serviceDate: targetDate })
      return next
    })

    startTransition(async () => {
      const result = await rescheduleService(cardId, targetDate)
      if (result?.error) {
        // Roll back on error
        setDays(initialDays)
      }
    })
  }

  const draggingCard = draggingId
    ? days.flatMap((d) => d.cards).find((c) => c.id === draggingId)
    : null

  return (
    <div className="min-w-0 space-y-6">
      {photoModalFor && (
        <CompletionPhotoModal
          serviceId={photoModalFor.id}
          customerName={photoModalFor.customerName}
          onPhotoSaved={(_url) => {
            setPhotoModalFor(null)
            finishComplete(photoModalFor.id)
          }}
          onSkip={() => {
            setPhotoModalFor(null)
            finishComplete(photoModalFor.id)
          }}
          onClose={() => setPhotoModalFor(null)}
        />
      )}
      {days.map((day) => {
        const isDropTarget = isManager && overDate === day.dateStr && draggingId !== null
        const canDrop = isDropTarget && dragSourceDate.current !== day.dateStr

        return (
          <div
            key={day.dateStr}
            className="min-w-0"
            onDragOver={isManager ? (e) => handleDragOver(e, day.dateStr) : undefined}
            onDragLeave={isManager ? () => setOverDate(null) : undefined}
            onDrop={isManager ? (e) => handleDrop(e, day.dateStr) : undefined}
          >
            {/* Day header */}
            <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  'text-xs font-bold uppercase tracking-widest',
                  day.isToday ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {day.dayLabel}
                </span>
                <span className={cn(
                  'text-base font-semibold',
                  day.isToday ? 'text-primary' : 'text-foreground'
                )}>
                  {day.dateLabel}
                </span>
              </div>
              {day.cards.length > 0 && (
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  day.isToday
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {day.cards.length} {day.cards.length === 1 ? 'job' : 'jobs'}
                </span>
              )}
              {day.weather && <WeatherBadge weather={day.weather} />}
              <div className="h-px min-w-8 flex-1 bg-border/60" />
            </div>

            {/* Cards grid */}
            {day.cards.length === 0 ? (
              <div className={cn(
                'rounded-lg border border-dashed px-4 py-4 text-sm font-medium text-muted-foreground transition-colors',
                canDrop
                  ? 'border-primary/50 bg-primary/5 text-primary'
                  : 'bg-card/55'
              )}>
                {canDrop && draggingCard
                  ? `Move "${draggingCard.customerName}" here`
                  : 'No services'}
              </div>
            ) : (
              <div className={cn(
                'grid min-w-0 items-start gap-3 rounded-lg p-1 -m-1 transition-colors sm:grid-cols-2',
                canDrop && 'bg-primary/5 ring-2 ring-primary/30 ring-inset'
              )}>
                {day.cards.map((card) => {
                  const canDrag = isManager && card.status === 'scheduled'
                  return (
                    <div
                      key={card.id}
                      draggable={canDrag}
                      onDragStart={canDrag ? () => handleDragStart(card.id, day.dateStr) : undefined}
                      onDragEnd={canDrag ? handleDragEnd : undefined}
                      className={cn(
                        'min-w-0',
                        canDrag && 'cursor-grab active:cursor-grabbing',
                        draggingId === card.id && 'opacity-40 scale-95 transition-transform'
                      )}
                    >
                      <ScheduleCard
                        serviceId={card.id}
                        customerId={card.customerId}
                        customerName={card.customerName}
                        serviceType={card.serviceType}
                        serviceDate={card.serviceDate}
                        status={card.status}
                        totalPrice={card.totalPrice}
                        notes={card.notes}
                        customerNotes={card.customerNotes}
                        customerAddress={card.customerAddress}
                        approvedAt={card.approvedAt}
                        reminderStatus={card.reminderStatus}
                        reminderSentAt={card.reminderSentAt}
                        completionPhotoUrl={card.completionPhotoUrl}
                        boats={card.boats}
                        employees={employees}
                        isManager={isManager}
                        onComplete={handleComplete}
                        onDelete={handleDelete}
                      />
                    </div>
                  )
                })}
                {/* Drop indicator appended when target day already has cards */}
                {canDrop && draggingCard && (
                  <div className="flex min-h-[80px] items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 text-sm font-semibold text-primary/70">
                    Drop here
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
