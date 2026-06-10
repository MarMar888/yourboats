'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Camera, Check, Clock, Flag, Mail, MapPin } from 'lucide-react'
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
  completionPhotoUrl: string | null
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
              'inline-flex min-h-6 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-all duration-150 cursor-pointer select-none',
              assigned
                ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/15'
                : anyAssigned
                  ? 'border-transparent bg-muted/50 text-muted-foreground/50 hover:border-border hover:bg-muted hover:text-muted-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
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
  completionPhotoUrl,
  isManager,
  onComplete,
  onDelete,
}: ScheduleCardProps) {
  const [complaintOpen, setComplaintOpen] = useState(false)
  const isComplete = status === 'complete'
  const isCancelled = status === 'cancelled'

  return (
    <div className={cn(
      'group relative flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg border bg-card shadow-[0_1px_0_hsl(var(--foreground)/0.04),0_14px_34px_hsl(var(--foreground)/0.05)] transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_1px_0_hsl(var(--foreground)/0.05),0_18px_42px_hsl(var(--foreground)/0.08)]',
      isComplete && 'border-emerald-200 bg-emerald-50/30',
      isCancelled && 'border-destructive/30 opacity-70',
    )}>
      {/* Status accent bar */}
      <div className={cn(
        'h-1 w-full',
        isComplete  ? 'bg-emerald-400'
        : isCancelled ? 'bg-destructive/60'
        : reminderStatus !== 'none' ? 'bg-amber-400'
        : 'bg-primary/55'
      )} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Name + service type */}
          <div className="min-w-0 flex-1">
            <Link
              href={`/schedule/${serviceId}`}
              className="font-semibold text-[15px] leading-snug transition-colors hover:text-primary after:absolute after:inset-0"
            >
              {customerName}
            </Link>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {serviceType}
            </p>
          </div>

          {/* Actions + status */}
          <div className="relative z-10 flex items-center gap-1 shrink-0">
            {completionPhotoUrl && (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700" title="Completion photo attached">
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
            {approvedAt && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-1 text-[10px] font-semibold text-emerald-700">
                <Check className="h-3 w-3" aria-hidden="true" />
                Approved
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
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700"
              title={reminderSentAt ? `Sent ${reminderSentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : undefined}
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              Reminder sent
            </span>
          </div>
        )}
        {reminderStatus === 'scheduled' && (
          <div className="mt-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Reminder scheduled
            </span>
          </div>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pb-3 space-y-2.5 flex-1">
        {/* Customer-level notes */}
        {customerNotes && (
          <div className="flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
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
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
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
      <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-2.5 sm:flex-nowrap">
        {customerAddress && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 max-w-full flex-[1_1_100%] items-center gap-1 truncate text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary sm:flex-1"
            onClick={(e) => e.stopPropagation()}
          >
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{customerAddress}</span>
          </a>
        )}

        <div className="ml-auto flex max-w-full shrink-0 items-center gap-1.5">
          {totalPrice && (
            <span className="text-sm font-bold tabular-nums text-foreground">
              ${parseFloat(totalPrice).toFixed(2)}
            </span>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setComplaintOpen(true)}
          >
            <Flag className="h-3 w-3" aria-hidden="true" />
            Flag
          </Button>

          {status === 'scheduled' && (
            <Button
              size="sm"
              className="text-[11px] h-7 px-2.5 font-medium"
              onClick={() => onComplete(serviceId)}
            >
              Complete
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
