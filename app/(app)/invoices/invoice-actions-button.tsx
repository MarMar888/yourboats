'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { createQboInvoice, sendQboInvoice } from './actions'

type Props = {
  invoiceId: string
  hasQboId: boolean
  status: string
}

export function InvoiceActionsButton({ invoiceId, hasQboId, status }: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  if (status === 'sent' || status === 'paid' || status === 'void') return null

  const label = !hasQboId ? 'Create in QBO' : 'Send to customer'
  const action = !hasQboId ? createQboInvoice : sendQboInvoice

  const handle = () => {
    setError('')
    startTransition(async () => {
      const result = await action(invoiceId)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={hasQboId ? 'default' : 'outline'} onClick={handle} disabled={isPending}>
        {isPending ? (hasQboId ? 'Sending…' : 'Creating…') : label}
      </Button>
      {error && <p className="text-xs text-destructive max-w-48 text-right">{error}</p>}
    </div>
  )
}
