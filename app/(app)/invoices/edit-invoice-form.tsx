'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateInvoice } from './actions'

type Props = {
  invoiceId: string
  initialNotes: string | null
  initialStatus: string
  initialDocNumber: number | null
  lineItems: {
    boatId: string
    nickname: string
    lengthFt: number | null
    description: string | null
    rateType: 'per_ft' | 'flat' | null
    rate: string | null
  }[]
  onClose: () => void
}

export function EditInvoiceForm({ invoiceId, initialNotes, initialStatus, initialDocNumber, lineItems, onClose }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [status, setStatus] = useState(initialStatus)
  const [docNumber, setDocNumber] = useState(initialDocNumber ? String(initialDocNumber) : '')
  const [items, setItems] = useState(() =>
    lineItems.map((item) => ({
      boatId: item.boatId,
      nickname: item.nickname,
      lengthFt: item.lengthFt,
      description: item.description ?? '',
      rateType: item.rateType ?? 'per_ft',
      rate: item.rate ?? '0',
    }))
  )
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const total = items.reduce((sum, item) => {
    const rate = Number(item.rate || 0)
    const qty = item.rateType === 'per_ft' ? (item.lengthFt ?? 0) : 1
    return sum + rate * qty
  }, 0)

  const updateItem = (boatId: string, next: Partial<(typeof items)[number]>) => {
    setItems((prev) => prev.map((item) => item.boatId === boatId ? { ...item, ...next } : item))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await updateInvoice(invoiceId, {
        notes,
        status,
        docNumber,
        lineItems: items.map((item) => ({
          boatId: item.boatId,
          description: item.description,
          rateType: item.rateType,
          rate: item.rate,
        })),
      })
      if (result.ok) {
        onClose()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Line items</Label>
        <div className="space-y-3">
          {items.map((item) => {
            const rate = Number(item.rate || 0)
            const qty = item.rateType === 'per_ft' ? (item.lengthFt ?? 0) : 1
            const amount = rate * qty
            return (
              <div key={item.boatId} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{item.nickname}</div>
                    {item.lengthFt && (
                      <div className="text-xs text-muted-foreground">{item.lengthFt} ft</div>
                    )}
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">${amount.toFixed(2)}</div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`inv-desc-${item.boatId}`}>Description</Label>
                  <Input
                    id={`inv-desc-${item.boatId}`}
                    value={item.description}
                    onChange={(e) => updateItem(item.boatId, { description: e.target.value })}
                    placeholder="Interior, Exterior, Cabin"
                  />
                </div>

                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`inv-rate-type-${item.boatId}`}>Type</Label>
                    <select
                      id={`inv-rate-type-${item.boatId}`}
                      value={item.rateType}
                      onChange={(e) => updateItem(item.boatId, { rateType: e.target.value as 'per_ft' | 'flat' })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="per_ft">$/ft</option>
                      <option value="flat">Flat</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`inv-rate-${item.boatId}`}>
                      {item.rateType === 'per_ft' ? 'Rate per foot' : 'Flat fee'}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        id={`inv-rate-${item.boatId}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateItem(item.boatId, { rate: e.target.value })}
                        className="pl-6"
                        required
                      />
                    </div>
                  </div>
                </div>

                {item.rateType === 'per_ft' && (
                  <p className="text-xs text-muted-foreground">
                    {item.lengthFt ?? 0} ft x ${rate.toFixed(2)} = ${amount.toFixed(2)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-end text-sm font-semibold">Total: ${total.toFixed(2)}</div>
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
