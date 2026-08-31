'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { QuoteAddon, QuoteService } from '@/lib/db/schema'
import type { ActionResult } from './actions'
import { updateQuoteAddonItem, updateQuoteServiceItem } from './actions'

function CatalogRow({
  id,
  name,
  description,
  billingType,
  initialRate,
  initialMinPrice,
  initialActive,
  initialRequiresPhotos,
  onSave,
}: {
  id: string
  name: string
  description: string | null
  billingType: string
  initialRate: string
  initialMinPrice: string | null
  initialActive: boolean
  initialRequiresPhotos?: boolean
  onSave: (id: string, formData: FormData) => Promise<ActionResult>
}) {
  const [rate, setRate] = useState(initialRate)
  const [minPrice, setMinPrice] = useState(initialMinPrice ?? '')
  const [active, setActive] = useState(initialActive)
  const [requiresPhotos, setRequiresPhotos] = useState(initialRequiresPhotos ?? false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError('')
    setSaved(false)
    const formData = new FormData()
    formData.set('rate', rate)
    formData.set('minPrice', minPrice)
    if (active) formData.set('active', 'on')
    if (initialRequiresPhotos !== undefined && requiresPhotos) formData.set('requiresPhotos', 'on')
    startTransition(async () => {
      const result = await onSave(id, formData)
      if (result.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1600)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-medium">{name}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{billingType === 'per_ft' ? '$/ft' : billingType === 'per_hour' ? '$/hr' : 'Flat $'}</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Min $</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          placeholder="None"
          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded accent-primary"
        />
        Active
      </label>

      {initialRequiresPhotos !== undefined && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={requiresPhotos}
            onChange={(e) => setRequiresPhotos(e.target.checked)}
            className="h-4 w-4 rounded accent-primary"
          />
          Needs photos
        </label>
      )}

      <Button size="sm" variant="outline" onClick={handleSave} disabled={isPending}>
        {saved ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {isPending ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </Button>

      {error && <p className="w-full text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

export function PricingEditor({ services, addons }: { services: QuoteService[]; addons: QuoteAddon[] }) {
  const recurring = services.filter((s) => s.category === 'recurring')
  const detail = services.filter((s) => s.category === 'detail')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recurring plans</h2>
        <div className="rounded-lg border bg-card">
          {recurring.map((s) => (
            <CatalogRow
              key={s.id}
              id={s.id}
              name={s.name}
              description={s.description}
              billingType={s.billingType}
              initialRate={s.rate}
              initialMinPrice={s.minPrice}
              initialActive={s.active}
              initialRequiresPhotos={s.requiresPhotos}
              onSave={updateQuoteServiceItem}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detail services</h2>
        <div className="rounded-lg border bg-card">
          {detail.map((s) => (
            <CatalogRow
              key={s.id}
              id={s.id}
              name={s.name}
              description={s.description}
              billingType={s.billingType}
              initialRate={s.rate}
              initialMinPrice={s.minPrice}
              initialActive={s.active}
              initialRequiresPhotos={s.requiresPhotos}
              onSave={updateQuoteServiceItem}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Add-ons</h2>
        <div className="rounded-lg border bg-card">
          {addons.map((a) => (
            <CatalogRow
              key={a.id}
              id={a.id}
              name={a.name}
              description={a.description}
              billingType={a.billingType}
              initialRate={a.rate}
              initialMinPrice={a.minPrice}
              initialActive={a.active}
              onSave={updateQuoteAddonItem}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
