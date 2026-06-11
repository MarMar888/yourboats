'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export default function SyncQboItemsButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ synced: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setState('loading')
    setError(null)
    try {
      const res = await fetch('/api/qbo/sync-items', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setResult(data)
      setState('done')
      toast.success(`${data.synced} QBO item${data.synced === 1 ? '' : 's'} synced`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setState('error')
      toast.error(message)
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleSync} disabled={state === 'loading'}>
        {state === 'loading' ? 'Syncing…' : 'Sync items from QuickBooks'}
      </Button>
      {state === 'done' && result && (
        <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
          Done — {result.synced} items synced.
        </p>
      )}
      {state === 'error' && error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
