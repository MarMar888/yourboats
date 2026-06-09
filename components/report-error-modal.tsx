'use client'

import { useState, useTransition, useRef } from 'react'
import posthog from 'posthog-js'
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

export default function ReportErrorModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const close = () => {
    onOpenChange(false)
    setDone(false)
    formRef.current?.reset()
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const comment = data.get('comment') as string
    startTransition(async () => {
      posthog.capture('error_reported', { comment })
      setDone(true)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an error</DialogTitle>
        </DialogHeader>

        {done ? (
          <>
            <DialogBody>
              <p className="text-sm text-muted-foreground">
                Thanks — your report has been sent. We'll look into it.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit}>
            <DialogBody>
              <div className="space-y-1.5">
                <Label htmlFor="error-comment">Describe the issue *</Label>
                <textarea
                  id="error-comment"
                  name="comment"
                  rows={5}
                  required
                  placeholder="What went wrong? What were you trying to do?"
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {isPending ? 'Sending…' : 'Send report'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
