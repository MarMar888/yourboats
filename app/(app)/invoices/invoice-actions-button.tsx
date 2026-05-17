'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { createQboInvoice, sendQboInvoice } from './actions'

type QboItemOption = { qboItemId: string; name: string }

type Props = {
  invoiceId: string
  hasQboId: boolean
  status: string
  qboItems?: QboItemOption[]
}

export function InvoiceActionsButton({ invoiceId, hasQboId, status, qboItems = [] }: Props) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [selectedItemId, setSelectedItemId] = useState<string>(qboItems[0]?.qboItemId ?? '')

  if (status === 'sent' || status === 'paid' || status === 'void') return null

  const label = !hasQboId ? 'Create in QBO' : 'Send to customer'

  const handle = () => {
    setError('')
    startTransition(async () => {
      let result
      if (!hasQboId) {
        result = await createQboInvoice(invoiceId, selectedItemId || undefined)
      } else {
        result = await sendQboInvoice(invoiceId)
      }
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {!hasQboId && qboItems.length > 0 && (
        <select
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
          disabled={isPending}
          className="text-xs rounded-md border border-input bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {qboItems.map((item) => (
            <option key={item.qboItemId} value={item.qboItemId}>
              {item.name}
            </option>
          ))}
        </select>
      )}
      <Button size="sm" variant={hasQboId ? 'default' : 'outline'} onClick={handle} disabled={isPending}>
        {isPending ? (hasQboId ? 'Sending…' : 'Creating…') : label}
      </Button>
      {error && <p className="text-xs text-destructive max-w-48 text-right">{error}</p>}
    </div>
  )
}
