'use client'

import { useTransition } from 'react'
import { markIncomplete } from '../actions'
import { Button } from '@/components/ui/button'

interface MarkIncompleteButtonProps {
  serviceId: string
}

export function MarkIncompleteButton({ serviceId }: MarkIncompleteButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => { await markIncomplete(serviceId) })
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
