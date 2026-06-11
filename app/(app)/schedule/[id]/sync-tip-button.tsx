'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { syncTipFromQbo } from './sync-tip-action'

export function SyncTipButton({ serviceId }: { serviceId: string }) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  function handleSync() {
    startTransition(async () => {
      const result = await syncTipFromQbo(serviceId)
      if (result.error) {
        setMessage({ text: result.error, error: true })
        toast.error(result.error)
      } else if (result.tipAmount && result.tipAmount > 0) {
        const message = `Synced $${result.tipAmount.toFixed(2)} from QBO`
        setMessage({ text: message, error: false })
        toast.success(message)
      } else {
        setMessage({ text: 'No tip line found in QBO invoice', error: false })
        toast.info('No tip line found in QBO invoice')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleSync} disabled={isPending}>
        {isPending ? 'Syncing…' : 'Sync from QBO'}
      </Button>
      {message && (
        <span className={`text-xs ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </span>
      )}
    </div>
  )
}
