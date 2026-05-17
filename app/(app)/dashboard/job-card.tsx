'use client'

import { useTransition } from 'react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { markComplete } from './actions'

export type BoatLine = {
  boatId: string
  nickname: string
  makeModel: string | null
  lengthFt: number | null
  boatNotes: string | null
}

export type JobCardProps = {
  serviceId: string
  serviceType: string
  serviceTypeLabel: string
  status: string
  serviceDate: string
  notes: string | null
  customerName: string
  customerAddress: string | null
  customerNotes: string | null
  boats: BoatLine[]
  canComplete: boolean
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'secondary' | 'outline'> = {
  scheduled: 'default',
  complete: 'success',
  cancelled: 'secondary',
}

export default function JobCard({
  serviceId,
  serviceTypeLabel,
  status,
  notes,
  customerName,
  customerAddress,
  customerNotes,
  boats,
  canComplete,
}: JobCardProps) {
  const [isPending, startTransition] = useTransition()

  function handleMarkComplete() {
    startTransition(async () => {
      await markComplete(serviceId)
    })
  }

  const mapsUrl = customerAddress
    ? `https://maps.google.com/?q=${encodeURIComponent(customerAddress)}`
    : null

  return (
    <Card className={cn('transition-opacity', isPending && 'opacity-60')}>
      <CardContent className="pt-5 pb-3 space-y-3">
        {/* Customer + address */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-base leading-tight">{customerName}</p>
            {customerAddress && (
              <p className="text-sm text-muted-foreground mt-0.5">{customerAddress}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
              {status}
            </Badge>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline whitespace-nowrap"
              >
                View map
              </a>
            )}
          </div>
        </div>

        {/* Service type */}
        <p className="text-sm font-medium text-muted-foreground">{serviceTypeLabel}</p>

        {/* Customer notes (gate codes / KISS) */}
        {customerNotes && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-900">
            {customerNotes}
          </div>
        )}

        {/* Boats */}
        {boats.length > 0 && (
          <div className="space-y-1.5">
            {boats.map((b) => (
              <div
                key={b.boatId}
                className="rounded-md bg-muted px-3 py-2 text-sm"
              >
                <span className="font-medium">{b.nickname}</span>
                {(b.makeModel || b.lengthFt) && (
                  <span className="block text-muted-foreground sm:ml-1.5 sm:inline">
                    {[b.makeModel, b.lengthFt ? `${b.lengthFt}ft` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                {b.boatNotes && (
                  <p className="text-muted-foreground mt-0.5">{b.boatNotes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Service notes */}
        {notes && (
          <p className="text-sm text-muted-foreground border-t pt-2">{notes}</p>
        )}
      </CardContent>

      {canComplete && status === 'scheduled' && (
        <CardFooter className="pt-0 pb-4">
          <Button
            size="sm"
            onClick={handleMarkComplete}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? 'Marking complete…' : 'Mark complete'}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
