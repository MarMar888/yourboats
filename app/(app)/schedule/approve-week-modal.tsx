'use client'

import { useState, useTransition } from 'react'
import { approveWeek, unapproveWeek } from './actions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type ScheduledService = {
  id: string
  serviceDate: string   // YYYY-MM-DD
  customerName: string
  boats: string[]
}

function reminderLabel(serviceDate: string): string {
  // Cron fires at 18:00 UTC (2 PM ET) the day before
  const [y, m, d] = serviceDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d - 1)) // day before, UTC midnight
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const month   = date.toLocaleDateString('en-US', { month: 'short',   timeZone: 'UTC' })
  const day     = date.toLocaleDateString('en-US', { day: 'numeric',   timeZone: 'UTC' })
  return `${weekday} ${month} ${day} at 2 PM ET`
}

// ─── Approve modal ────────────────────────────────────────────────────────────

interface ApproveWeekModalProps {
  startDate: string
  endDate: string
  scheduledServices: ScheduledService[]
}

export function ApproveWeekModal({ startDate, endDate, scheduledServices }: ApproveWeekModalProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await approveWeek(startDate, endDate)
      setOpen(false)
    })
  }

  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
  const upcomingServices = scheduledServices.filter((svc) => svc.serviceDate >= today)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Approve week
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve week</DialogTitle>
          </DialogHeader>

          <div className="px-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Approving this week enables reminder emails. Each customer will receive a
              message the evening before their service.
            </p>

            {upcomingServices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No upcoming services need reminders.
              </p>
            ) : (
              <div className="divide-y rounded-lg border overflow-hidden text-sm">
                {upcomingServices.map((svc) => (
                  <div key={svc.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="font-medium leading-tight">{svc.customerName}</p>
                      <p className="text-xs text-muted-foreground">{svc.serviceDate}</p>
                      {svc.boats.length > 0 && (
                        <p className="text-xs text-muted-foreground">{svc.boats.join(', ')}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Reminder</p>
                      <p className="text-xs font-medium text-sky-700 tabular-nums mt-0.5">
                        {reminderLabel(svc.serviceDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={pending}>
              {pending ? 'Approving…' : 'Confirm & approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Unapprove button ─────────────────────────────────────────────────────────

interface UnapproveWeekButtonProps {
  startDate: string
  endDate: string
}

export function UnapproveWeekButton({ startDate, endDate }: UnapproveWeekButtonProps) {
  const [pending, startTransition] = useTransition()

  function handleUnapprove() {
    startTransition(async () => {
      await unapproveWeek(startDate, endDate)
    })
  }

  return (
    <button
      onClick={handleUnapprove}
      disabled={pending}
      className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors disabled:opacity-50"
    >
      {pending ? 'Unapproving…' : 'Unapprove'}
    </button>
  )
}
