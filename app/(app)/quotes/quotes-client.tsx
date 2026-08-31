'use client'

import { useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BoatModel, QuoteAddon, QuoteRequest, QuoteService } from '@/lib/db/schema'
import { RequestCard } from './request-card'
import { PricingEditor } from './pricing-editor'
import { BoatModelsEditor } from './boat-models-editor'

export function QuotesClient({
  requests,
  services,
  addons,
  boatModels,
  quoteUrl,
}: {
  requests: QuoteRequest[]
  services: QuoteService[]
  addons: QuoteAddon[]
  boatModels: BoatModel[]
  quoteUrl: string
}) {
  const [tab, setTab] = useState<'requests' | 'pricing' | 'boats'>('requests')
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(quoteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context); no-op.
    }
  }

  const newCount = requests.filter((r) => r.status === 'new').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-muted-foreground">{quoteUrl}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyLink}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={quoteUrl} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={cn(
            'relative px-3 py-2 text-sm font-medium transition-colors',
            tab === 'requests' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Requests
          {newCount > 0 && (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {newCount} new
            </span>
          )}
          {tab === 'requests' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
        </button>
        <button
          type="button"
          onClick={() => setTab('pricing')}
          className={cn(
            'relative px-3 py-2 text-sm font-medium transition-colors',
            tab === 'pricing' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Pricing &amp; catalog
          {tab === 'pricing' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
        </button>
        <button
          type="button"
          onClick={() => setTab('boats')}
          className={cn(
            'relative px-3 py-2 text-sm font-medium transition-colors',
            tab === 'boats' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Boat models
          {tab === 'boats' && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
        </button>
      </div>

      {tab === 'requests' && (
        requests.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No quote requests yet. Share the link above to start collecting signups.
          </div>
        ) : (
          <div className="space-y-2.5">
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} services={services} />
            ))}
          </div>
        )
      )}

      {tab === 'pricing' && <PricingEditor services={services} addons={addons} />}

      {tab === 'boats' && <BoatModelsEditor boatModels={boatModels} />}
    </div>
  )
}
