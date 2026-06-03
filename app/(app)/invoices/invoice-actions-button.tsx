'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { createQboInvoice, sendQboInvoice } from './actions'

type Props = {
  invoiceId: string
  hasQboId: boolean
  status: string
  isPrepaid?: boolean
  qboItems?: unknown  // kept for API compatibility — no longer used in UI
}

export function InvoiceActionsButton({ invoiceId, hasQboId, status, isPrepaid }: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  if (status === 'sent' || status === 'paid' || status === 'void') return null
  // Prepaid customers don't get invoiced through QBO
  if (!hasQboId && isPrepaid) return null

  const label = !hasQboId ? 'Create in QBO' : 'Send to customer'

  const handle = () => {
    setError('')
    startTransition(async () => {
      const result = !hasQboId
        ? await createQboInvoice(invoiceId)
        : await sendQboInvoice(invoiceId)
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
