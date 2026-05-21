'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateInvoice } from './actions'

type Props = {
  invoiceId: string
  initialAmount: string
  initialNotes: string | null
  initialStatus: string
  initialDocNumber: number | null
  onClose: () => void
}

export function EditInvoiceForm({ invoiceId, initialAmount, initialNotes, initialStatus, initialDocNumber, onClose }: Props) {
  const [amount, setAmount] = useState(Number(initialAmount).toFixed(2))
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [status, setStatus] = useState(initialStatus)
  const [docNumber, setDocNumber] = useState(initialDocNumber ? String(initialDocNumber) : '')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await updateInvoice(invoiceId, { amount, notes, status, docNumber })
      if (result.ok) {
        onClose()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="inv-amount">Amount ($)</Label>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            id="inv-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pl-6"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-doc-number">Invoice #</Label>
        <Input
          id="inv-doc-number"
          type="number"
          min="1"
          step="1"
          value={docNumber}
          onChange={(e) => setDocNumber(e.target.value)}
          placeholder="e.g. 1400"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-status">Status</Label>
        <select
          id="inv-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="void">Void</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-notes">Notes</Label>
        <textarea
          id="inv-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Invoice notes…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
