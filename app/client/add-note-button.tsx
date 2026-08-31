'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitServiceRequest } from './actions'

export function AddNoteButton() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await submitServiceRequest({ type: 'note', message })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Sent. The team will follow up.')
      setOpen(false)
      setMessage('')
    })
  }

  if (!open) {
    return (
      <Button variant="outline" className="flex-1" onClick={() => setOpen(true)}>
        Add notes
      </Button>
    )
  }

  return (
    <div className="w-full space-y-2 rounded-md border border-border p-3">
      <Label htmlFor="dashboard-note">Note for the team</Label>
      <Input
        id="dashboard-note"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. gate code changed, best time to reach me"
        autoFocus
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending || !message.trim()} onClick={submit}>
          {isPending ? 'Sending…' : 'Send'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setMessage('')
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
