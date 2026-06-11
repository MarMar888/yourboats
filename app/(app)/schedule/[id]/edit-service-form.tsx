'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { updateService } from './actions'
import { actionResultError, runToastAction } from '@/lib/action-toast'

const SERVICE_TYPES = [
  { value: 'recurring', label: 'Standard Clean' },
  { value: 'detailing', label: 'Detailing' },
  { value: 'buffing_waxing', label: 'Buffing & Waxing' },
  { value: 'acid_washing', label: 'Acid Washing' },
  { value: 'powerwashing', label: 'Powerwashing' },
  { value: 'gelcoat_wetsanding', label: 'Gelcoat Wet-Sanding' },
  { value: 'captaining', label: 'Captaining' },
  { value: 'other', label: 'Other' },
]

const BOAT_SERVICES = ['Interior', 'Exterior', 'Cabin', 'Engine Bay', 'Canvas']

type Employee = { id: string; displayName: string }

type BoatDetail = {
  boatId: string
  nickname: string
  makeModel: string | null
  lengthFt: number | null
  description: string | null
  notes: string | null
  rateType: string | null
  rate: string | null
  assignedIds: string[]
}

type BoatConfig = {
  included: boolean
  services: string[]
  notes: string
  rateType: 'per_ft' | 'flat'
  rate: string
  assignedUserIds: string[]
}

function boatConfigFromDetail(b: BoatDetail): BoatConfig {
  return {
    included: true,
    services: b.description ? b.description.split(',').map((s) => s.trim()).filter(Boolean) : ['Interior', 'Exterior'],
    notes: b.notes ?? '',
    rateType: (b.rateType as 'per_ft' | 'flat') ?? 'per_ft',
    rate: b.rate ?? '3',
    assignedUserIds: b.assignedIds,
  }
}

function BoatRow({
  boat,
  config,
  onChange,
  employees,
}: {
  boat: BoatDetail
  config: BoatConfig
  onChange: (next: BoatConfig) => void
  employees: Employee[]
}) {
  const amount =
    config.rateType === 'per_ft'
      ? (boat.lengthFt ?? 0) * Number(config.rate || 0)
      : Number(config.rate || 0)

  const toggleService = (svc: string) => {
    const next = config.services.includes(svc)
      ? config.services.filter((s) => s !== svc)
      : [...config.services, svc]
    onChange({ ...config, services: next })
  }

  const toggleEmployee = (uid: string) => {
    const next = config.assignedUserIds.includes(uid)
      ? config.assignedUserIds.filter((id) => id !== uid)
      : [...config.assignedUserIds, uid]
    onChange({ ...config, assignedUserIds: next })
  }

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      config.included ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
    )}>
      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.included}
          onChange={(e) => onChange({ ...config, included: e.target.checked })}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{boat.nickname}</span>
          {boat.makeModel && (
            <span className="text-xs text-muted-foreground ml-2">{boat.makeModel}</span>
          )}
        </div>
        {boat.lengthFt && (
          <span className="text-xs text-muted-foreground">{boat.lengthFt} ft</span>
        )}
        {config.included && (
          <span className="text-sm font-medium tabular-nums ml-4">${amount.toFixed(2)}</span>
        )}
      </label>

      {config.included && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Services</p>
            <div className="flex flex-wrap gap-2">
              {BOAT_SERVICES.map((svc) => (
                <label key={svc} className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-colors',
                  config.services.includes(svc)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                )}>
                  <input
                    type="checkbox"
                    checked={config.services.includes(svc)}
                    onChange={() => toggleService(svc)}
                    className="sr-only"
                  />
                  {svc}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
            <textarea
              value={config.notes}
              onChange={(e) => onChange({ ...config, notes: e.target.value })}
              rows={2}
              placeholder="Boat-specific instructions…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate type</p>
              <div className="flex rounded-md border overflow-hidden">
                {(['per_ft', 'flat'] as const).map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => onChange({ ...config, rateType: rt })}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors',
                      config.rateType === rt
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {rt === 'per_ft' ? '$/ft' : 'Flat'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 w-28">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {config.rateType === 'per_ft' ? 'Rate ($/ft)' : 'Flat rate ($)'}
              </p>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.rate}
                  onChange={(e) => onChange({ ...config, rate: e.target.value })}
                  className="flex h-8 w-full rounded-md border border-input bg-background pl-6 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            {config.rateType === 'per_ft' && boat.lengthFt && (
              <p className="text-xs text-muted-foreground pb-1.5">
                {boat.lengthFt} ft × ${Number(config.rate || 0).toFixed(2)} = <strong>${amount.toFixed(2)}</strong>
              </p>
            )}
          </div>

          {employees.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assign to</p>
              <div className="flex flex-wrap gap-2">
                {employees.map((emp) => (
                  <label key={emp.id} className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-colors',
                    config.assignedUserIds.includes(emp.id)
                      ? 'bg-secondary text-secondary-foreground border-secondary'
                      : 'border-border hover:bg-muted'
                  )}>
                    <input
                      type="checkbox"
                      checked={config.assignedUserIds.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="sr-only"
                    />
                    {emp.displayName}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {config.included && (
        <>
          <input type="hidden" name="boatIds" value={boat.boatId} />
          <input type="hidden" name={`boat_desc_${boat.boatId}`} value={config.services.join(', ')} />
          <input type="hidden" name={`boat_notes_${boat.boatId}`} value={config.notes} />
          <input type="hidden" name={`boat_rateType_${boat.boatId}`} value={config.rateType} />
          <input type="hidden" name={`boat_rate_${boat.boatId}`} value={config.rate} />
          {config.assignedUserIds.map((uid) => (
            <input key={uid} type="hidden" name={`boat_employees_${boat.boatId}`} value={uid} />
          ))}
        </>
      )}
    </div>
  )
}

export function EditServiceForm({
  serviceId,
  initialValues,
  boats,
  allCustomerBoats,
  employees,
  onClose,
}: {
  serviceId: string
  initialValues: {
    serviceDate: string
    serviceType: string
    notes: string | null
    totalPrice: string | null
    status: string
  }
  boats: BoatDetail[]
  allCustomerBoats: BoatDetail[]
  employees: Employee[]
  onClose: () => void
}) {
  // Initialize boat configs from existing service boats
  const initialConfigs: Record<string, BoatConfig> = {}
  for (const b of allCustomerBoats) {
    const existing = boats.find((sb) => sb.boatId === b.boatId)
    if (existing) {
      initialConfigs[b.boatId] = boatConfigFromDetail(existing)
    } else {
      initialConfigs[b.boatId] = { included: false, services: ['Interior', 'Exterior'], notes: '', rateType: 'per_ft', rate: '3', assignedUserIds: [] }
    }
  }

  const [boatConfigs, setBoatConfigs] = useState<Record<string, BoatConfig>>(initialConfigs)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const total = allCustomerBoats
    .filter((b) => boatConfigs[b.boatId]?.included)
    .reduce((sum, b) => {
      const cfg = boatConfigs[b.boatId]
      const amount = cfg.rateType === 'per_ft'
        ? (b.lengthFt ?? 0) * Number(cfg.rate || 0)
        : Number(cfg.rate || 0)
      return sum + amount
    }, 0)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    const form = e.currentTarget
    const formData = new FormData(form)
    startTransition(async () => {
      const result = await updateService(serviceId, formData)
      const ok = await runToastAction(async () => result, { success: 'Service updated', error: 'Failed to update service' })
      if (ok) {
        onClose()
      } else {
        setError(actionResultError(result) ?? 'Failed to update service')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="serviceDate">Date</Label>
          <Input
            id="serviceDate"
            name="serviceDate"
            type="date"
            required
            defaultValue={initialValues.serviceDate}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="serviceType">Service type</Label>
          <select
            id="serviceType"
            name="serviceType"
            required
            defaultValue={initialValues.serviceType}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SERVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          required
          defaultValue={initialValues.status}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="scheduled">Scheduled</option>
          <option value="complete">Complete</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initialValues.notes ?? ''}
          placeholder="Any special instructions…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      {allCustomerBoats.length > 0 && (
        <div className="space-y-2">
          <Label>Boats &amp; services</Label>
          <div className="space-y-2">
            {allCustomerBoats.map((b) => (
              <BoatRow
                key={b.boatId}
                boat={b}
                config={boatConfigs[b.boatId] ?? { included: false, services: ['Interior', 'Exterior'], notes: '', rateType: 'per_ft', rate: '3', assignedUserIds: [] }}
                onChange={(next) => setBoatConfigs((prev) => ({ ...prev, [b.boatId]: next }))}
                employees={employees}
              />
            ))}
          </div>
          {total > 0 && (
            <div className="flex justify-end pt-1">
              <p className="text-sm font-semibold">Total: ${total.toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
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
