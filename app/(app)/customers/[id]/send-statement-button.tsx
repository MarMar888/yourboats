'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { sendCustomerStatement } from './send-statement-action'

export function SendStatementButton({ customerId }: { customerId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const result = await sendCustomerStatement(customerId)
      if (!result.ok) {
        setError(result.error)
      } else {
        setDone(true)
      }
    })
  }

  if (done) {
    return <span className="text-xs text-green-600 font-medium">Statement sent ✓</span>
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
        {isPending ? 'Sending…' : 'Send statement'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
