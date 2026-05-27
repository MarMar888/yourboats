'use client'

import { useState, useRef, useTransition } from 'react'
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
  customerId: string
  customerName: string
  boats: { boatId: string; nickname: string; boatNotes: string | null; serviceBoatNotes: string | null; assignedIds: string[] }[]
}

export type WeatherDay = {
  tempMaxF: number
  precipPct: number
  windMph: number
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
    <div className="space-y-6">
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
            onDragOver={isManager ? (e) => handleDragOver(e, day.dateStr) : undefined}
            onDragLeave={isManager ? () => setOverDate(null) : undefined}
            onDrop={isManager ? (e) => handleDrop(e, day.dateStr) : undefined}
          >
            {/* Day header */}
            <div className="flex items-center gap-3 mb-3">
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
                  'text-[11px] font-medium rounded-full px-2 py-0.5',
                  day.isToday
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {day.cards.length} {day.cards.length === 1 ? 'job' : 'jobs'}
                </span>
              )}
              {day.weather && (
                <span
                  className={cn(
                    'text-[11px] font-medium rounded-full px-2 py-0.5 tabular-nums',
                    day.weather.precipPct >= 60
                      ? 'bg-blue-50 text-blue-700'
                      : day.weather.precipPct >= 30
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-muted text-muted-foreground'
                  )}
                  title={`High: ${day.weather.tempMaxF}°F · Rain: ${day.weather.precipPct}% · Wind: ${day.weather.windMph} mph`}
                >
                  {day.weather.precipPct >= 60 ? '🌧' : day.weather.precipPct >= 30 ? '🌦' : '☀️'}{' '}
                  {day.weather.tempMaxF}° · {day.weather.precipPct}% · {day.weather.windMph} mph
                </span>
              )}
              <div className="flex-1 h-px bg-border/60" />
            </div>

            {/* Cards grid */}
            {day.cards.length === 0 ? (
              <div className={cn(
                'rounded-lg border border-dashed py-4 px-4 text-sm text-muted-foreground transition-colors',
                canDrop
                  ? 'border-primary/50 bg-primary/5 text-primary'
                  : 'bg-card/50'
              )}>
                {canDrop && draggingCard
                  ? `Move "${draggingCard.customerName}" here`
                  : 'No services'}
              </div>
            ) : (
              <div className={cn(
                'columns-1 sm:columns-2 lg:columns-3 gap-3 rounded-xl transition-colors p-1 -m-1',
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
                        'break-inside-avoid mb-3',
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
                  <div className="break-inside-avoid mb-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 min-h-[80px] flex items-center justify-center text-sm text-primary/70 font-medium">
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
