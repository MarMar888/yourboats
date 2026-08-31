'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Calendar, CameraOff, ChevronDown, Mail, MapPin, Phone } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { getBoatType } from '@/lib/quote/boat-types'
import { selectionNeedsPhotos, type QuoteLineItem } from '@/lib/quote/pricing'
import type { QuoteRequest, QuoteService } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import { updateQuoteRequestStatus } from './actions'

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  new: 'default',
  contacted: 'warning',
  converted: 'success',
  declined: 'secondary',
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  declined: 'Declined',
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function RequestCard({ request, services }: { request: QuoteRequest; services: QuoteService[] }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(request.status)
  const [isPending, startTransition] = useTransition()

  const boatType = getBoatType(request.boatTypeKey)
  const lineItems = safeParseJson<QuoteLineItem[]>(request.quotedPriceBreakdown) ?? []
  const detailServiceKeys = safeParseJson<string[]>(request.detailServiceKeys) ?? []
  const photoUrls = safeParseJson<string[]>(request.photoUrls) ?? []
  const needsPhotos = selectionNeedsPhotos(
    { planType: request.planType as 'recurring' | 'detail', recurringServiceKey: request.recurringServiceKey, detailServiceKeys },
    services
  )
  const preferredDates =
    request.preferredStartDate || request.preferredEndDate
      ? [request.preferredStartDate, request.preferredEndDate].filter(Boolean).join(' to ')
      : null

  function handleStatusChange(next: string) {
    setStatus(next)
    startTransition(async () => {
      const result = await updateQuoteRequestStatus(request.id, next)
      if (!result.ok) setStatus(request.status)
    })
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{STATUS_LABEL[status] ?? status}</Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{request.customerName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {boatType?.label ?? request.boatTypeKey} · {request.boatLengthFt} ft ·{' '}
            {request.planType === 'recurring' ? 'Recurring wash' : 'One-time detail'}
          </p>
        </div>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {new Date(request.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">${Number(request.quotedPrice).toFixed(2)}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-4 border-t px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 text-sm">
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {request.phone || 'No phone'}
              </p>
              {request.email && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {request.email}
                </p>
              )}
              {request.address && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {request.address}
                </p>
              )}
              {preferredDates && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Prefers {preferredDates}
                </p>
              )}
              {(request.boatNickname || request.boatMakeModel) && (
                <p className="text-muted-foreground">
                  {[request.boatNickname, request.boatMakeModel].filter(Boolean).join(', ')}
                </p>
              )}
              {request.notes && <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">{request.notes}</p>}
              {request.message && (
                <p className="rounded-md bg-accent px-2.5 py-1.5 text-xs text-accent-foreground">
                  <span className="font-semibold">Question: </span>
                  {request.message}
                </p>
              )}

              {photoUrls.length > 0 ? (
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {photoUrls.map((url, i) => {
                    // Blobs are private; rendered through the index-based read proxy, not the raw blob url.
                    const proxyUrl = `/api/quote-requests/${request.id}/photos/${i}`
                    return (
                      <a key={url} href={proxyUrl} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proxyUrl} alt="Boat photo" className="aspect-square w-full rounded-md border object-cover" />
                      </a>
                    )
                  })}
                </div>
              ) : needsPhotos ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CameraOff className="h-3.5 w-3.5" aria-hidden="true" /> Photos requested, none uploaded yet
                </p>
              ) : null}
            </div>

            <div className="rounded-md bg-muted/40 px-3 py-2.5">
              <ul className="space-y-1 text-sm">
                {lineItems.map((li) => (
                  <li key={li.key} className="flex justify-between">
                    <span className="text-muted-foreground">{li.name}</span>
                    <span className="tabular-nums font-medium">${li.price.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex justify-between border-t pt-1.5 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">${Number(request.quotedPrice).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex items-center gap-2">
              <label htmlFor={`status-${request.id}`} className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <select
                id={`status-${request.id}`}
                value={status}
                disabled={isPending}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="converted">Converted</option>
                <option value="declined">Declined</option>
              </select>
            </div>

            {!request.convertedCustomerId && (
              <Link
                href={`/customers/new?fromQuote=${request.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Convert to customer →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
