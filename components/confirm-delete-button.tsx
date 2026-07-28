'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type ActionResult = { ok: boolean; error?: string }

type Props = {
  action: () => Promise<ActionResult | void>
  title?: string
  description?: string
  triggerLabel?: string
  confirmLabel?: string
  pendingLabel?: string
  size?: 'sm' | 'default'
  // 'destructive' (default) is red, for delete/void-style actions.
  // 'default' is neutral, for confirm-gated actions that aren't destructive
  // (e.g. recording a payment).
  tone?: 'destructive' | 'default'
}

export function ConfirmDeleteButton({
  action,
  title = 'Confirm delete',
  description = 'This action cannot be undone.',
  triggerLabel = 'Delete',
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting…',
  size = 'sm',
  tone = 'destructive',
}: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await action()
        if (result && !result.ok) {
          setError(result.error ?? 'Something went wrong.')
        } else {
          setOpen(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  return (
    <>
      <Button
        variant={tone === 'destructive' ? 'ghost' : 'outline'}
        size={size}
        className={tone === 'destructive' ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : undefined}
        onClick={() => { setError(null); setOpen(true) }}
      >
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive px-1">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant={tone === 'destructive' ? 'destructive' : 'default'} onClick={handleConfirm} disabled={isPending}>
              {isPending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
