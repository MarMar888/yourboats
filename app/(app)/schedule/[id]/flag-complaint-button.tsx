'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { flagComplaint } from './actions'

interface FlagComplaintButtonProps {
  serviceId: string
  customerId: string
}

export default function FlagComplaintButton({
  serviceId,
  customerId,
}: FlagComplaintButtonProps) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'minor' | 'major'>('minor')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!description.trim()) {
      setError('Description is required.')
      return
    }

    startTransition(async () => {
      try {
        await flagComplaint(serviceId, customerId, description, severity)
        setDescription('')
        setSeverity('minor')
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  function handleCancel() {
    setOpen(false)
    setDescription('')
    setSeverity('minor')
    setError(null)
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Flag complaint
      </Button>
    )
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 w-full max-w-lg">
      <p className="text-sm font-semibold mb-3">Flag a complaint</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="complaint-description" className="text-xs font-medium text-muted-foreground block mb-1">
            Description <span className="text-destructive">*</span>
          </label>
          <textarea
            id="complaint-description"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            rows={3}
            placeholder="Describe the complaint…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Severity</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSeverity('minor')}
              disabled={isPending}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                severity === 'minor'
                  ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                  : 'bg-background border-input text-muted-foreground hover:bg-muted'
              }`}
            >
              Minor
            </button>
            <button
              type="button"
              onClick={() => setSeverity('major')}
              disabled={isPending}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                severity === 'major'
                  ? 'bg-red-100 border-red-400 text-red-800'
                  : 'bg-background border-input text-muted-foreground hover:bg-muted'
              }`}
            >
              Major
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Saving…' : 'Submit complaint'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
