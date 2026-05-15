'use client'

import { useState, useTransition, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { logComplaint } from '@/app/(app)/complaints/actions'
import { cn } from '@/lib/utils'

type Severity = 'minor' | 'major'

export default function LogComplaintModal({
  serviceId,
  customerId,
  open,
  onOpenChange,
}: {
  serviceId: string
  customerId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [severity, setSeverity] = useState<Severity>('minor')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const close = () => {
    onOpenChange(false)
    setError('')
    setSeverity('minor')
    formRef.current?.reset()
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    data.set('severity', severity)
    startTransition(async () => {
      const result = await logComplaint(data)
      if (!result.ok) {
        setError(result.error)
        return
      }
      close()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log complaint</DialogTitle>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit}>
          <input type="hidden" name="serviceId" value={serviceId} />
          <input type="hidden" name="customerId" value={customerId} />

          <DialogBody>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="complaint-description">Description *</Label>
              <textarea
                id="complaint-description"
                name="description"
                rows={4}
                required
                placeholder="Describe the complaint…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Severity toggle */}
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <div className="inline-flex rounded-lg border bg-muted p-1 gap-1">
                {(['minor', 'major'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={cn(
                      'px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
                      severity === s
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Logging…' : 'Log complaint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
