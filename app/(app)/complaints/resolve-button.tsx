'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { resolveComplaint } from './actions'

export default function ResolveButton({ complaintId }: { complaintId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleResolve = () => {
    startTransition(async () => {
      try {
        await resolveComplaint(complaintId)
        toast.success('Complaint resolved')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to resolve complaint')
      }
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
