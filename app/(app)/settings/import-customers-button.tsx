'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export default function ImportCustomersButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ imported: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleImport() {
    setState('loading')
    setError(null)
    try {
      const res = await fetch('/api/qbo/import-customers', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setResult(data)
      setState('done')
      toast.success(`${data.imported} customer${data.imported === 1 ? '' : 's'} synced`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setState('error')
      toast.error(message)
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleImport} disabled={state === 'loading'}>
        {state === 'loading' ? 'Importing…' : 'Import from QuickBooks'}
      </Button>
      {state === 'done' && result && (
        <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
          Done — {result.imported} customers synced.
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
