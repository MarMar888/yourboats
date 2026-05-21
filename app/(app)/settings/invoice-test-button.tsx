'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { sendInvoiceTest } from './actions'

export default function InvoiceTestButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleClick() {
    setResult(null)
    startTransition(async () => {
      const r = await sendInvoiceTest()
      setResult(r)
    })
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleClick} disabled={pending} variant="outline" size="sm">
        {pending ? 'Sending…' : 'Send test message'}
      </Button>
      {result && (
        <p className={`text-sm ${result.ok ? 'text-green-700' : 'text-destructive'}`}>
          {result.message}
        </p>
      )}
    </div>
  )
}
