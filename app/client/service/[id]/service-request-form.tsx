'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitServiceRequest } from '@/app/client/actions'

type Mode = null | 'reschedule' | 'cancel' | 'note'

export function ServiceRequestForm({ serviceId }: { serviceId: string }) {
  const [mode, setMode] = useState<Mode>(null)
  const [date, setDate] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit(type: NonNullable<Mode>) {
    startTransition(async () => {
      const result = await submitServiceRequest({
        serviceId,
        type,
        requestedDate: type === 'reschedule' ? date : undefined,
        message: type === 'note' || type === 'cancel' ? message : undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Sent. The team will follow up.')
      setMode(null)
      setDate('')
      setMessage('')
    })
  }

  if (mode === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setMode('reschedule')}>
          Request to move
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMode('cancel')}>
          Cancel this service
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMode('note')}>
          Send a note
        </Button>
      </div>
    )
  }

  if (mode === 'reschedule') {
    return (
      <div className="space-y-3 rounded-md border border-border p-3">
        <Label htmlFor="new-date">Preferred new date</Label>
        <Input id="new-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" disabled={isPending || !date} onClick={() => submit('reschedule')}>
            {isPending ? 'Sending…' : 'Send request'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'cancel') {
    return (
      <div className="space-y-3 rounded-md border border-border p-3">
        <p className="text-sm text-muted-foreground">
          We&apos;ll hold off until staff confirms, since crew may already be assigned to this date.
        </p>
        <Label htmlFor="cancel-note">Reason (optional)</Label>
        <Input id="cancel-note" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional" />
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" disabled={isPending} onClick={() => submit('cancel')}>
            {isPending ? 'Sending…' : 'Request cancellation'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <Label htmlFor="note">Note for the team</Label>
      <Input id="note" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. side gate is locked, use the dock" />
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending || !message.trim()} onClick={() => submit('note')}>
          {isPending ? 'Sending…' : 'Send note'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
