'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import LogComplaintModal from '@/components/log-complaint-modal'
import { markComplete, deleteService } from './actions'
import { updateBoatAssignments } from './[id]/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleCardBoat = {
  boatId: string
  nickname: string
  boatNotes: string | null
  serviceBoatNotes: string | null
  assignedIds: string[]
}

export type ScheduleCardEmployee = {
  id: string
  displayName: string
}

export type ReminderStatus = 'sent' | 'scheduled' | 'none'

interface ScheduleCardProps {
  serviceId: string
  customerId: string
  customerName: string
  serviceType: string   // display label
  serviceDate: string   // YYYY-MM-DD
  status: string
  totalPrice: string | null
  notes: string | null
  customerNotes: string | null
  approvedAt: Date | null
  reminderStatus: ReminderStatus
  reminderSentAt: Date | null
  boats: ScheduleCardBoat[]
  employees: ScheduleCardEmployee[]
  isManager: boolean
}

// ─── Assignment chips ─────────────────────────────────────────────────────────

function BoatChips({
  serviceId,
  boat,
  employees,
}: {
  serviceId: string
  boat: ScheduleCardBoat
  employees: ScheduleCardEmployee[]
}) {
  const [assignedIds, setAssignedIds] = useState(boat.assignedIds)
  const [isPending, startTransition] = useTransition()
  const anyAssigned = assignedIds.length > 0

  function toggle(userId: string) {
    const next = assignedIds.includes(userId)
      ? assignedIds.filter((id) => id !== userId)
      : [...assignedIds, userId]
    setAssignedIds(next)
    startTransition(async () => {
      await updateBoatAssignments(serviceId, boat.boatId, next)
    })
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {employees.map((emp) => {
        const assigned = assignedIds.includes(emp.id)
        return (
          <button
            key={emp.id}
            disabled={isPending}
            onClick={() => toggle(emp.id)}
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-150 cursor-pointer',
              assigned
                ? 'bg-foreground text-background border-transparent shadow-sm'
                : anyAssigned
                  ? 'text-muted-foreground/40 border-border/30 hover:text-muted-foreground hover:border-border'
                  : 'text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground',
              isPending && 'opacity-60 cursor-not-allowed'
            )}
          >
            {emp.displayName}
          </button>
        )
      })}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'secondary' | 'destructive'> = {
  scheduled: 'secondary',
  complete:  'success',
  cancelled: 'destructive',
}

export default function ScheduleCard({
  serviceId,
  customerId,
  customerName,
  serviceType,
  serviceDate,
  status,
  totalPrice,
  notes,
  customerNotes,
  approvedAt,
  reminderStatus,
  reminderSentAt,
  boats,
  employees,
  isManager,
}: ScheduleCardProps) {
  const [complaintOpen, setComplaintOpen] = useState(false)
  const [completePending, startComplete] = useTransition()

  function handleComplete() {
    startComplete(async () => {
      await markComplete(serviceId)
    })
  }

  return (
    <div className={cn(
      'relative flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden',
      approvedAt && 'border-green-200'
    )}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={cn('px-4 pt-3.5 pb-2.5', approvedAt && 'bg-green-50/30')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {/* Stretched link covers the whole card; interactive children sit above it with z-10 */}
            <Link
              href={`/schedule/${serviceId}`}
              className="font-semibold text-[15px] leading-tight after:absolute after:inset-0"
            >
              {customerName}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">{serviceType}</p>
          </div>

          <div className="relative z-10 flex items-center gap-1.5 shrink-0 pt-0.5">
            {approvedAt && (
              <span className="text-xs text-green-600 font-medium leading-none">✓</span>
            )}
            <Badge variant={STATUS_VARIANT[status] ?? 'secondary'} className="capitalize text-xs">
              {status}
            </Badge>
            {isManager && (
              <ConfirmDeleteButton
                action={deleteService.bind(null, serviceId, undefined)}
                title="Delete service"
                description={`Delete the service for ${customerName}? The invoice will also be deleted.`}
                triggerLabel="×"
              />
            )}
          </div>
        </div>

        {/* Reminder tag */}
        <div className="relative z-10 mt-2">
          {reminderStatus === 'sent' ? (
            <span
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5"
              title={reminderSentAt ? `Sent ${reminderSentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : undefined}
            >
              ✉ Reminder sent
            </span>
          ) : reminderStatus === 'scheduled' ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              ⏰ Reminder scheduled
            </span>
          ) : status === 'scheduled' ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 border border-border/40 rounded-full px-2 py-0.5">
              No reminder
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 py-3 space-y-2.5 flex-1">
        {/* Customer-level notes */}
        {customerNotes && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug">
            {customerNotes}
          </p>
        )}

        {/* Service-level notes */}
        {notes && (
          <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
            {notes}
          </p>
        )}

        {boats.length > 0 && employees.length > 0 && (
          <div className="space-y-2.5">
            {boats.map((boat) => (
              <div key={boat.boatId}>
                {boats.length > 1 && (
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {boat.nickname}
                  </p>
                )}
                {/* Boat-level notes */}
                {boat.boatNotes && (
                  <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2 mb-1.5">
                    {boat.boatNotes}
                  </p>
                )}
                {/* Service-boat notes */}
                {boat.serviceBoatNotes && (
                  <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1 mb-1.5 leading-snug">
                    {boat.serviceBoatNotes}
                  </p>
                )}
                {isManager ? (
                  <BoatChips serviceId={serviceId} boat={boat} employees={employees} />
                ) : (
                  boat.assignedIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {boat.assignedIds.map((id) => {
                        const emp = employees.find((e) => e.id === id)
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center rounded-full border border-transparent bg-foreground/10 px-2.5 py-0.5 text-xs font-medium"
                          >
                            {emp?.displayName ?? id}
                          </span>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {/* Boats with no employee list (read-only fallback) */}
        {boats.length > 0 && employees.length === 0 && (
          <div className="space-y-1">
            {boats.map((b) => (
              <div key={b.boatId}>
                <p className="text-sm font-medium">{b.nickname}</p>
                {b.boatNotes && (
                  <p className="text-xs text-muted-foreground italic pl-1">{b.boatNotes}</p>
                )}
                {b.serviceBoatNotes && (
                  <p className="text-xs text-sky-700 italic pl-1">{b.serviceBoatNotes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 py-2.5 border-t bg-muted/20 flex items-center gap-2">
        {/* Price */}
        {totalPrice && (
          <span className="text-sm font-semibold tabular-nums text-foreground">
            ${parseFloat(totalPrice).toFixed(2)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Complaint */}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 px-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setComplaintOpen(true)}
          >
            Flag issue
          </Button>

          {/* Complete */}
          {isManager && status === 'scheduled' && (
            <Button
              size="sm"
              className="text-xs h-7 px-2.5"
              onClick={handleComplete}
              disabled={completePending}
            >
              {completePending ? 'Saving…' : 'Mark complete'}
            </Button>
          )}
        </div>
      </div>

      <LogComplaintModal
        serviceId={serviceId}
        customerId={customerId}
        open={complaintOpen}
        onOpenChange={setComplaintOpen}
      />
    </div>
  )
}
