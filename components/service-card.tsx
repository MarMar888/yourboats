'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import LogComplaintModal from '@/components/log-complaint-modal'
import AssignInline from '@/app/(app)/schedule/assign-inline'
import { markComplete, markIncomplete } from '@/app/(app)/schedule/actions'
import { runToastAction } from '@/lib/action-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceCardBoat = {
  boatId: string
  nickname: string
  makeModel?: string | null
  lengthFt?: number | null
  boatNotes?: string | null
  assignedIds?: string[]
}

export type ServiceCardEmployee = {
  id: string
  displayName: string
}

export type ServiceCardProps = {
  serviceId: string
  customerId: string
  customerName: string
  customerNotes?: string | null
  serviceType: string
  serviceTypeLabel: string
  serviceDate: string
  status: string
  notes?: string | null
  totalPrice?: string | null
  approvedAt?: Date | null
  boats: ServiceCardBoat[]
  userNameMap?: Record<string, string>
  // Feature flags
  canComplete?: boolean
  canManage?: boolean
  deleteAction?: () => Promise<void>
  employees?: ServiceCardEmployee[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'secondary' | 'destructive'> = {
  scheduled: 'secondary',
  complete:  'success',
  cancelled: 'destructive',
}

function formatDate(ymd: string) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ServiceCard({
  serviceId,
  customerId,
  customerName,
  customerNotes,
  serviceTypeLabel,
  serviceDate,
  status,
  notes,
  totalPrice,
  approvedAt,
  boats,
  userNameMap = {},
  canComplete,
  canManage,
  deleteAction,
  employees,
}: ServiceCardProps) {
  const [complaintOpen, setComplaintOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleMarkComplete() {
    startTransition(async () => {
      await runToastAction(
        () => markComplete(serviceId),
        {
          success: 'Service marked complete',
          error: 'Failed to complete service',
          undo: canManage ? {
            action: () => markIncomplete(serviceId),
            success: 'Service marked scheduled',
            error: 'Failed to mark service scheduled',
          } : undefined,
        },
      )
    })
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden transition-opacity',
        approvedAt && 'border-green-200',
        isPending && 'opacity-60'
      )}
    >
      {/* ── Header ── */}
      <div className={cn('px-4 pt-4 pb-3', approvedAt && 'bg-green-50/40')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/schedule/${serviceId}`}
              className="font-semibold text-base leading-tight hover:underline"
            >
              {customerName}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">
              {serviceTypeLabel} · {formatDate(serviceDate)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {approvedAt && (
              <span className="text-xs text-green-600 font-medium">✓</span>
            )}
            <Badge variant={STATUS_VARIANT[status] ?? 'secondary'} className="capitalize text-xs">
              {status}
            </Badge>
            {canManage && deleteAction && (
              <ConfirmDeleteButton
                action={deleteAction}
                title="Delete service"
                description={`Delete the service for ${customerName}? The invoice will also be deleted.`}
                triggerLabel="×"
                size="sm"
                successMessage="Service deleted"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pb-3 space-y-2.5 flex-1">
        {/* Customer notes / gate codes */}
        {customerNotes && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-900">
            {customerNotes}
          </div>
        )}

        {/* Boats */}
        {boats.length > 0 && (
          <div className="space-y-1">
            {boats.map((b) => {
              const assigneeNames = (b.assignedIds ?? [])
                .map((id) => userNameMap[id] ?? id)
                .filter(Boolean)
              return (
                <div key={b.boatId} className="text-sm">
                  <span className="font-medium">{b.nickname}</span>
                  {(b.makeModel || b.lengthFt) && (
                    <span className="text-muted-foreground ml-1.5">
                      {[b.makeModel, b.lengthFt ? `${b.lengthFt}ft` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {assigneeNames.length > 0 && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      — {assigneeNames.join(', ')}
                    </span>
                  )}
                  {b.boatNotes && (
                    <p className="text-xs text-muted-foreground mt-0.5 ml-0.5">{b.boatNotes}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Service notes */}
        {notes && (
          <p className="text-sm text-muted-foreground border-t pt-2">{notes}</p>
        )}

        {/* Inline assign (managers) */}
        {canManage && employees && employees.length > 0 && (
          <AssignInline
            serviceId={serviceId}
            boats={boats.map((b) => ({
              boatId: b.boatId,
              nickname: b.nickname,
              assignedIds: b.assignedIds ?? [],
            }))}
            employees={employees}
          />
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2.5 border-t flex items-center gap-2">
        {/* Flag complaint */}
        <button
          onClick={() => setComplaintOpen(true)}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors font-medium"
          title="Flag a complaint"
        >
          Flag issue
        </button>

        {/* Price */}
        {totalPrice && (
          <span className="text-sm font-medium tabular-nums ml-auto">
            ${parseFloat(totalPrice).toFixed(2)}
          </span>
        )}

        {/* Mark complete */}
        {canComplete && status === 'scheduled' && (
          <Button
            size="sm"
            onClick={handleMarkComplete}
            disabled={isPending}
            className={cn(!totalPrice && 'ml-auto')}
          >
            {isPending ? 'Saving…' : 'Complete'}
          </Button>
        )}
      </div>

      {/* Complaint modal */}
      <LogComplaintModal
        serviceId={serviceId}
        customerId={customerId}
        open={complaintOpen}
        onOpenChange={setComplaintOpen}
      />
    </div>
  )
}
