'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { reconcileDocNumbers } from './actions'

export function ReconcileDocNumbersButton() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; updated: number; message?: string } | null>(null)

  const handleClick = () => {
    setResult(null)
    startTransition(async () => {
      const r = await reconcileDocNumbers()
      setResult(r)
    })
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Fetching from QBO…' : 'Reconcile now'}
      </Button>
      {result && (
        <span className={result.ok ? 'text-sm text-green-700' : 'text-sm text-destructive'}>
          {result.ok ? `Updated ${result.updated} invoice${result.updated !== 1 ? 's' : ''} ✓` : result.message}
        </span>
      )}
    </div>
  )
}
