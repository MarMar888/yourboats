'use client'

import { useTransition } from 'react'
import { setReminderSuppressed } from './actions'
import { Button } from '@/components/ui/button'

interface SuppressButtonProps {
  serviceId: string
  suppressed: boolean
}

export function SuppressButton({ serviceId, suppressed }: SuppressButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => setReminderSuppressed(serviceId, !suppressed))
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
