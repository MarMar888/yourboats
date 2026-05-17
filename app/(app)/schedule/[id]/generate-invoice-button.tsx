'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { generateInvoiceFromService } from './actions'

export function GenerateInvoiceButton({ serviceId }: { serviceId: string }) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handle = () => {
    setError('')
    startTransition(async () => {
      const result = await generateInvoiceFromService(serviceId)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={handle} disabled={isPending}>
        {isPending ? 'Generating…' : 'Generate invoice'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
