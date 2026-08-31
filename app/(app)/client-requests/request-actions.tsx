'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { approveRescheduleRequest, approveCancelRequest, resolveRequest } from './actions'

type Props = {
  id: string
  type: 'reschedule' | 'cancel' | 'note' | 'new_service'
  createServiceHref?: string
}

export function RequestActions({ id, type, createServiceHref }: Props) {
  const [response, setResponse] = useState('')
  const [showResponse, setShowResponse] = useState(false)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error)
    })
  }

  if (type === 'reschedule') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => run(() => approveRescheduleRequest(id))}>
          Approve move
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => resolveRequest(id, 'denied'))}>
          Deny
        </Button>
      </div>
    )
  }

  if (type === 'cancel') {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run(() => approveCancelRequest(id))}>
          Approve cancellation
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => resolveRequest(id, 'denied'))}>
          Deny
        </Button>
      </div>
    )
  }

  // note / new_service: optional reply, then mark resolved or dismiss
  return (
    <div className="space-y-2">
      {createServiceHref && (
        <Button size="sm" variant="secondary" asChild>
          <Link href={createServiceHref}>Create service</Link>
        </Button>
      )}
      {showResponse ? (
        <div className="flex gap-2">
          <Input
            placeholder="Reply to customer (optional)"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            className="h-9"
          />
          <Button size="sm" disabled={isPending} onClick={() => run(() => resolveRequest(id, 'approved', response))}>
            Send & resolve
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={isPending} onClick={() => setShowResponse(true)}>
            Resolve
          </Button>
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => resolveRequest(id, 'denied'))}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}
