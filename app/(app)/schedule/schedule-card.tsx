'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import LogComplaintModal from '@/components/log-complaint-modal'
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
  serviceType: string
  serviceDate: string
  status: string
  totalPrice: string | null
  notes: string | null
  customerNotes: string | null
  customerAddress: string | null
  approvedAt: Date | null
  reminderStatus: ReminderStatus
  reminderSentAt: Date | null
  boats: ScheduleCardBoat[]
  employees: ScheduleCardEmployee[]
  isManager: boolean
  onComplete: (serviceId: string) => void
  onDelete: (serviceId: string) => void
}

// ─── Employee assignment chips ─────────────────────────────────────────────────

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
        const firstName = emp.displayName.split(' ')[0]
        return (
          <button
            key={emp.id}
            disabled={isPending}
            onClick={() => toggle(emp.id)}
            className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-all duration-100 cursor-pointer select-none',
              assigned
                ? 'bg-foreground text-background'
                : anyAssigned
                  ? 'text-muted-foreground/40 bg-muted/40 hover:text-muted-foreground hover:bg-muted'
                  : 'text-muted-foreground bg-muted hover:bg-muted/70',
              isPending && 'opacity-50 cursor-not-allowed'
            )}
          >
            {firstName}
          </button>
        )
      })}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export default function ScheduleCard({
  serviceId,
  customerId,
  customerName,
  serviceType,
  status,
  totalPrice,
  notes,
  customerNotes,
  customerAddress,
  approvedAt,
  reminderStatus,
  reminderSentAt,
  boats,
  employees,
  isManager,
  onComplete,
  onDelete,
}: ScheduleCardProps) {
  const [complaintOpen, setComplaintOpen] = useState(false)
  const isComplete = status === 'complete'
  const isCancelled = status === 'cancelled'

  return (
    <div className={cn(
      'relative flex flex-col rounded-xl border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md',
      isComplete && 'border-emerald-200 bg-emerald-50/20',
      isCancelled && 'border-red-200 opacity-70',
    )}>
      {/* Status accent bar */}
      <div className={cn(
        'h-0.5 w-full',
        isComplete  ? 'bg-emerald-400'
        : isCancelled ? 'bg-red-300'
        : reminderStatus !== 'none' ? 'bg-amber-300'
        : 'bg-border'
      )} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Name + service type */}
          <div className="min-w-0 flex-1">
            <Link
              href={`/schedule/${serviceId}`}
              className="font-semibold text-[15px] leading-snug hover:underline after:absolute after:inset-0"
            >
              {customerName}
            </Link>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium uppercase tracking-wide">
              {serviceType}
            </p>
          </div>

          {/* Actions + status */}
          <div className="relative z-10 flex items-center gap-1 shrink-0">
            {approvedAt && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 rounded px-1.5 py-0.5">
                ✓ Approved
              </span>
            )}
            {isManager && (
              <ConfirmDeleteButton
                action={async () => { onDelete(serviceId) }}
                title="Delete service"
                description={`Delete the service for ${customerName}? The invoice will also be deleted.`}
                triggerLabel="×"
              />
            )}
          </div>
        </div>

        {/* Reminder badge — only shown when active */}
        {reminderStatus === 'sent' && (
          <div className="mt-1.5">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5"
              title={reminderSentAt ? `Sent ${reminderSentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : undefined}
            >
              ✉ Reminder sent
            </span>
          </div>
        )}
        {reminderStatus === 'scheduled' && (
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              ⏰ Reminder scheduled
            </span>
          </div>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pb-3 space-y-2.5 flex-1">
        {/* Customer-level notes */}
        {customerNotes && (
          <div className="flex gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5">
            <span className="text-amber-500 text-xs mt-px shrink-0">⚠</span>
            <p className="text-[11px] text-amber-800 leading-snug">{customerNotes}</p>
          </div>
        )}

        {/* Service-level notes */}
        {notes && (
          <p className="text-[11px] text-muted-foreground italic leading-snug pl-2 border-l-2 border-muted">
            {notes}
          </p>
        )}

        {/* Boats + assignments */}
        {boats.length > 0 && (
          <div className="space-y-3">
            {boats.map((boat, idx) => (
              <div key={boat.boatId} className={cn(boats.length > 1 && idx > 0 && 'pt-2 border-t border-border/50')}>
                {/* Boat name header — always shown so users know which boat is which */}
                <p className="text-[11px] font-semibold text-foreground/70 mb-1 uppercase tracking-wide">
                  {boat.nickname}
                </p>

                {/* Boat notes */}
                {boat.boatNotes && (
                  <p className="text-[11px] text-muted-foreground italic leading-snug mb-1.5">
                    {boat.boatNotes}
                  </p>
                )}

                {/* Service-boat notes (per-visit instructions) */}
                {boat.serviceBoatNotes && (
                  <div className="rounded-md bg-sky-50 border border-sky-100 px-2.5 py-1.5 mb-1.5">
                    <p className="text-[11px] text-sky-800 leading-snug">{boat.serviceBoatNotes}</p>
                  </div>
                )}

                {/* Assignment chips */}
                {employees.length > 0 && (
                  isManager ? (
                    <BoatChips serviceId={serviceId} boat={boat} employees={employees} />
                  ) : (
                    boat.assignedIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {boat.assignedIds.map((id) => {
                          const emp = employees.find((e) => e.id === id)
                          const firstName = emp?.displayName.split(' ')[0] ?? id
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                            >
                              {firstName}
                            </span>
                          )
                        })}
                      </div>
                    )
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 py-2 border-t bg-muted/10 flex items-center gap-2">
        {customerAddress && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5 min-w-0 truncate"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="shrink-0">📍</span>
            <span className="truncate">{customerAddress}</span>
          </a>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {totalPrice && (
            <span className="text-sm font-bold tabular-nums text-foreground">
              ${parseFloat(totalPrice).toFixed(2)}
            </span>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-[11px] h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setComplaintOpen(true)}
          >
            Flag
          </Button>

          {isManager && status === 'scheduled' && (
            <Button
              size="sm"
              className="text-[11px] h-7 px-2.5 font-medium"
              onClick={() => onComplete(serviceId)}
            >
              Mark complete
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
