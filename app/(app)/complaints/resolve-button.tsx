'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { resolveComplaint } from './actions'

export default function ResolveButton({ complaintId }: { complaintId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleResolve = () => {
    startTransition(async () => {
      await resolveComplaint(complaintId)
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleResolve}
      disabled={isPending}
      className="shrink-0"
    >
      {isPending ? 'Resolving…' : 'Resolve'}
    </Button>
  )
}
