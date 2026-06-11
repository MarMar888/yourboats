'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { actionResultError, errorMessage, runToastAction } from '@/lib/action-toast'

type ActionResult = { ok: boolean; error?: string }

type Props = {
  action: () => Promise<ActionResult | void>
  title?: string
  description?: string
  triggerLabel?: string
  confirmLabel?: string
  pendingLabel?: string
  successMessage?: string
  size?: 'sm' | 'default'
}

export function ConfirmDeleteButton({
  action,
  title = 'Confirm delete',
  description = 'This action cannot be undone.',
  triggerLabel = 'Delete',
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting…',
  successMessage = 'Deleted',
  size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      let actionError: string | null = null
      const ok = await runToastAction(async () => {
        const result = await action()
        actionError = actionResultError(result)
        return result
      }, { success: successMessage, error: 'Something went wrong.' })

      if (ok) setOpen(false)
      else setError(actionError ?? errorMessage(actionError, 'Something went wrong.'))
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
            <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
              {isPending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
