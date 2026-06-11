'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { approveWeek, unapproveWeek, sendRemindersNow } from './actions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ScheduledService = {
  id: string
  serviceDate: string   // YYYY-MM-DD
  customerName: string
  boats: string[]
  reminderEmails: string[]
}

/** The cron fires at 18:00 UTC (1 PM CT) the day before the service. */
function reminderSendTime(serviceDate: string): Date {
  const [y, m, d] = serviceDate.split('-').map(Number)
  // Day before at 18:00 UTC
  return new Date(Date.UTC(y, m - 1, d - 1, 18, 0, 0))
}

function reminderLabel(serviceDate: string): string {
  const t = reminderSendTime(serviceDate)
  const weekday = t.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Chicago' })
  const month   = t.toLocaleDateString('en-US', { month: 'short',   timeZone: 'America/Chicago' })
  const day     = t.toLocaleDateString('en-US', { day: 'numeric',   timeZone: 'America/Chicago' })
  return `${weekday} ${month} ${day} at 1 PM CT`
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
  // Per-service decision for past-due reminders: 'send' | 'skip'
  const [decisions, setDecisions] = useState<Record<string, 'send' | 'skip'>>({})

  const now = new Date()
  const today = now.toLocaleDateString('en-CA') // YYYY-MM-DD local

  // Only show services from today onwards
  const upcomingServices = scheduledServices.filter((svc) => svc.serviceDate >= today)

  // Split into future (cron will handle) vs past-due (cron already ran)
  const futureServices  = upcomingServices.filter((svc) => reminderSendTime(svc.serviceDate) > now)
  const pastDueServices = upcomingServices.filter((svc) => reminderSendTime(svc.serviceDate) <= now)

  function getDecision(id: string): 'send' | 'skip' {
    return decisions[id] ?? 'send'
  }

  function toggle(id: string) {
    setDecisions((prev) => ({ ...prev, [id]: getDecision(id) === 'send' ? 'skip' : 'send' }))
  }

  function handleOpen() {
    // Reset decisions to default (send) when opening
    const defaults: Record<string, 'send' | 'skip'> = {}
    for (const svc of pastDueServices) {
      if (svc.reminderEmails.length > 0) defaults[svc.id] = 'send'
    }
    setDecisions(defaults)
    setOpen(true)
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        await approveWeek(startDate, endDate)

        // Immediately send reminders for past-due services marked "send"
        const toSendNow = pastDueServices
          .filter((svc) => svc.reminderEmails.length > 0 && getDecision(svc.id) === 'send')
          .map((svc) => svc.id)

        if (toSendNow.length > 0) {
          const reminderResult = await sendRemindersNow(toSendNow)
          if (reminderResult.errors.length > 0) {
            toast.error(`${reminderResult.errors.length} reminder${reminderResult.errors.length === 1 ? '' : 's'} failed`)
          }
        }

        setOpen(false)
        toast.success('Week approved', {
          action: {
            label: 'Undo',
            onClick: () => {
              startTransition(async () => {
                try {
                  await unapproveWeek(startDate, endDate)
                  toast.success('Week unapproved')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to unapprove week')
                }
              })
            },
          },
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to approve week')
      }
    })
  }

  const sendNowCount = pastDueServices.filter(
    (svc) => svc.reminderEmails.length > 0 && getDecision(svc.id) === 'send'
  ).length

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-sm font-medium px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Approve week
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve week</DialogTitle>
          </DialogHeader>

          <div className="px-6 space-y-4 overflow-y-auto flex-1">
            <p className="text-sm text-muted-foreground">
              Approving this week enables reminder emails. Reminders are sent the evening
              before each service to the voice/SMS addresses on file.
            </p>

            {upcomingServices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No upcoming services need reminders.
              </p>
            ) : (
              <div className="space-y-3">

                {/* ── Past-due reminders ──────────────────────────────────── */}
                {pastDueServices.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                      ⏰ Send time already passed — choose an action
                    </p>
                    <div className="divide-y rounded-lg border border-amber-200 overflow-hidden text-sm">
                      {pastDueServices.map((svc) => {
                        const hasContacts = svc.reminderEmails.length > 0
                        const decision = getDecision(svc.id)
                        return (
                          <div key={svc.id} className="px-4 py-3 space-y-2 bg-amber-50/40">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-0.5 min-w-0">
                                <p className="font-medium leading-tight">{svc.customerName}</p>
                                <p className="text-xs text-muted-foreground">{svc.serviceDate}</p>
                                {svc.boats.length > 0 && (
                                  <p className="text-xs text-muted-foreground">{svc.boats.join(', ')}</p>
                                )}
                              </div>

                              {/* Send / Skip toggle */}
                              {hasContacts && (
                                <div className="flex rounded-md border border-border overflow-hidden shrink-0 text-xs">
                                  <button
                                    onClick={() => decision !== 'send' && toggle(svc.id)}
                                    className={cn(
                                      'px-2.5 py-1 font-medium transition-colors',
                                      decision === 'send'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted'
                                    )}
                                  >
                                    Send now
                                  </button>
                                  <button
                                    onClick={() => decision !== 'skip' && toggle(svc.id)}
                                    className={cn(
                                      'px-2.5 py-1 font-medium border-l transition-colors',
                                      decision === 'skip'
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:bg-muted'
                                    )}
                                  >
                                    Skip
                                  </button>
                                </div>
                              )}
                            </div>

                            {hasContacts ? (
                              <div className="flex flex-wrap gap-1">
                                {svc.reminderEmails.map((email) => (
                                  <span
                                    key={email}
                                    className="inline-block text-[10px] bg-sky-50 text-sky-700 border border-sky-200 rounded px-1.5 py-0.5 font-mono"
                                  >
                                    {email}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-amber-600">
                                ⚠ No voice/SMS email — reminder will be skipped
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── Future reminders (cron will handle) ─────────────────── */}
                {futureServices.length > 0 && (
                  <div>
                    {pastDueServices.length > 0 && (
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Scheduled
                      </p>
                    )}
                    <div className="divide-y rounded-lg border overflow-hidden text-sm">
                      {futureServices.map((svc) => (
                        <div key={svc.id} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-0.5">
                              <p className="font-medium leading-tight">{svc.customerName}</p>
                              <p className="text-xs text-muted-foreground">{svc.serviceDate}</p>
                              {svc.boats.length > 0 && (
                                <p className="text-xs text-muted-foreground">{svc.boats.join(', ')}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted-foreground">Sends</p>
                              <p className="text-xs font-medium text-sky-700 tabular-nums mt-0.5">
                                {reminderLabel(svc.serviceDate)}
                              </p>
                            </div>
                          </div>
                          {svc.reminderEmails.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {svc.reminderEmails.map((email) => (
                                <span
                                  key={email}
                                  className="inline-block text-[10px] bg-sky-50 text-sky-700 border border-sky-200 rounded px-1.5 py-0.5 font-mono"
                                >
                                  {email}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-amber-600">
                              ⚠ No voice/SMS email — reminder will be skipped
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={pending}>
              {pending
                ? 'Approving…'
                : sendNowCount > 0
                  ? `Approve & send ${sendNowCount} reminder${sendNowCount > 1 ? 's' : ''}`
                  : 'Confirm & approve'}
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
      try {
        await unapproveWeek(startDate, endDate)
        toast.success('Week unapproved', {
          action: {
            label: 'Undo',
            onClick: () => {
              startTransition(async () => {
                try {
                  await approveWeek(startDate, endDate)
                  toast.success('Week approved')
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to approve week')
                }
              })
            },
          },
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to unapprove week')
      }
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
