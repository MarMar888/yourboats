'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { sendInvoiceReminder } from './actions'

export function SendReminderButton({ invoiceId, size = 'sm' }: { invoiceId: string; size?: 'sm' | 'default' }) {
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (sent) {
    return <span className="text-xs text-green-600 font-medium">Reminder sent ✓</span>
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size={size}
        variant="outline"
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation()
          setError('')
          startTransition(async () => {
            const result = await sendInvoiceReminder(invoiceId)
            if (!result.ok) setError(result.error)
            else setSent(true)
          })
        }}
      >
        {isPending ? 'Sending…' : 'Send reminder'}
      </Button>
      {error && <p className="text-xs text-destructive max-w-48 text-right">{error}</p>}
    </div>
  )
}
