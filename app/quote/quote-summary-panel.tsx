'use client'

import { Ship } from 'lucide-react'
import type { QuoteLineItem } from '@/lib/quote/pricing'
import { cn } from '@/lib/utils'

export function QuoteSummaryPanel({
  lineItems,
  total,
  boatLabel,
  className,
}: {
  lineItems: QuoteLineItem[]
  total: number
  boatLabel?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card shadow-[0_1px_0_hsl(var(--foreground)/0.04),0_16px_40px_hsl(var(--foreground)/0.08)]',
        className
      )}
    >
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <Ship className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-semibold">Your instant quote</p>
      </div>

      <div className="px-5 py-4">
        {lineItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pick a boat and a service to see your price build in real time.
          </p>
        ) : (
          <>
            {boatLabel && (
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {boatLabel}
              </p>
            )}
            <ul className="space-y-2">
              {lineItems.map((li) => (
                <li key={li.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground/90">{li.name}</span>
                  <span className="tabular-nums font-medium">${li.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t pt-3">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-2xl font-bold tabular-nums text-primary">${total.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
