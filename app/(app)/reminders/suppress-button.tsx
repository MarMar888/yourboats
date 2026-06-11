'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { setReminderSuppressed } from './actions'
import { Button } from '@/components/ui/button'

interface SuppressButtonProps {
  serviceId: string
  suppressed: boolean
}

export function SuppressButton({ serviceId, suppressed }: SuppressButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        await setReminderSuppressed(serviceId, !suppressed)
        toast.success(suppressed ? 'Reminder unsuppressed' : 'Reminder suppressed')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update reminder')
      }
    })
  }

  if (suppressed) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs h-7 px-2"
      >
        {isPending ? 'Updating…' : 'Unsuppress'}
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive"
    >
      {isPending ? 'Updating…' : 'Suppress'}
    </Button>
  )
}
