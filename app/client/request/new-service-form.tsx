'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitNewServiceRequest } from '@/app/client/actions'

type Boat = { id: string; nickname: string }

export function NewServiceForm({ serviceTypes, boats }: { serviceTypes: string[]; boats: Boat[] }) {
  const [serviceType, setServiceType] = useState(serviceTypes[0] ?? '')
  const [customType, setCustomType] = useState('')
  const [boatId, setBoatId] = useState(boats[0]?.id ?? '')
  const [date, setDate] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const resolvedType = serviceType === '__other__' ? customType : serviceType

  function submit() {
    if (!resolvedType.trim()) {
      toast.error('Pick or describe the service you need.')
      return
    }
    startTransition(async () => {
      const result = await submitNewServiceRequest({
        serviceType: resolvedType,
        boatId: boatId || undefined,
        requestedDate: date || undefined,
        message: message || undefined,
      })
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="service-type">Service</Label>
        <select
          id="service-type"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-inner shadow-foreground/[0.03] focus:border-primary/55 focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {serviceTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
          <option value="__other__">Something else…</option>
        </select>
        {serviceType === '__other__' && (
          <Input
            className="mt-2"
            placeholder="Describe what you need"
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
          />
        )}
      </div>

      {boats.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="boat">Boat</Label>
          <select
            id="boat"
            value={boatId}
            onChange={(e) => setBoatId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-inner shadow-foreground/[0.03] focus:border-primary/55 focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            {boats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nickname}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="preferred-date">Preferred date (optional)</Label>
        <Input id="preferred-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="message">Anything else?</Label>
        <Input id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional" />
      </div>

      <Button className="w-full" disabled={isPending} onClick={submit}>
        {isPending ? 'Sending…' : 'Send request'}
      </Button>
    </div>
  )
}
