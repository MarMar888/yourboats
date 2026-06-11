'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { pushCustomerToQbo } from './update-customer-action'

export function SyncToQboButton({ customerId }: { customerId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const result = await pushCustomerToQbo(customerId)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
      } else {
        setDone(true)
        toast.success('Customer synced to QBO')
      }
    })
  }

  if (done) {
    return <span className="text-xs text-green-600 font-medium">Synced ✓</span>
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? 'Syncing…' : 'Sync to QBO'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
