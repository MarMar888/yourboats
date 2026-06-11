'use client'

import { useTransition } from 'react'
import { markIncomplete } from '../actions'
import { Button } from '@/components/ui/button'
import { runToastAction } from '@/lib/action-toast'

interface MarkIncompleteButtonProps {
  serviceId: string
}

export function MarkIncompleteButton({ serviceId }: MarkIncompleteButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await runToastAction(
        () => markIncomplete(serviceId),
        { success: 'Service marked incomplete', error: 'Failed to mark service incomplete' }
      )
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs"
    >
      {isPending ? 'Updating…' : 'Mark incomplete'}
    </Button>
  )
}
