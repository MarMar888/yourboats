'use client'

import { useState, useTransition } from 'react'
import { addTip } from './add-tip-action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AddTipForm({ serviceId }: { serviceId: string }) {
  const [amount, setAmount] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed < 0) {
      setError('Enter a valid tip amount')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await addTip(serviceId, parsed)
        setAmount('')
      } catch {
        setError('Failed to save tip')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="pl-6 w-32"
          disabled={isPending}
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending || !amount}>
        {isPending ? 'Saving…' : 'Save tip'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  )
}
