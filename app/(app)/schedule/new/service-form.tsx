'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createService } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import QuickCreateModal from '@/components/quick-create-modal'
import { cn } from '@/lib/utils'
import type { Customer, Boat } from '@/lib/db/schema'

const FALLBACK_SERVICE_TYPES = [
  { value: 'recurring', label: 'Standard Clean' },
  { value: 'detailing', label: 'Detailing' },
  { value: 'buffing_waxing', label: 'Buffing & Waxing' },
  { value: 'acid_washing', label: 'Acid Washing' },
  { value: 'powerwashing', label: 'Powerwashing' },
  { value: 'gelcoat_wetsanding', label: 'Gelcoat Wet-Sanding' },
  { value: 'captaining', label: 'Captaining' },
  { value: 'other', label: 'Other' },
]

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const BOAT_SERVICES = ['Interior', 'Exterior', 'Cabin', 'Engine Bay', 'Canvas']

type Employee = { id: string; displayName: string }

type BoatConfig = {
  included: boolean
  services: string[]
  notes: string
  rateType: 'per_ft' | 'flat'
  rate: string
  assignedUserIds: string[]
}

function defaultConfig(): BoatConfig {
  return { included: false, services: ['Interior', 'Exterior'], notes: '', rateType: 'per_ft', rate: '3', assignedUserIds: [] }
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

function BoatRow({ boat, config, onChange, employees, canAssign }: {
  boat: Boat
  config: BoatConfig
  onChange: (next: BoatConfig) => void
  employees: Employee[]
  canAssign: boolean
}) {
  const amount = config.rateType === 'per_ft'
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
          {/* Services */}
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

          {/* Per-boat notes */}
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

          {/* Rate */}
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

          {/* Employee assignment (manager+) */}
          {canAssign && employees.length > 0 && (
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
          <input type="hidden" name="boatIds" value={boat.id} />
          <input type="hidden" name={`boat_desc_${boat.id}`} value={config.services.join(', ')} />
          <input type="hidden" name={`boat_notes_${boat.id}`} value={config.notes} />
          <input type="hidden" name={`boat_rateType_${boat.id}`} value={config.rateType} />
          <input type="hidden" name={`boat_rate_${boat.id}`} value={config.rate} />
          {config.assignedUserIds.map((uid) => (
            <input key={uid} type="hidden" name={`boat_employees_${boat.id}`} value={uid} />
          ))}
        </>
      )}
    </div>
  )
}

function BoatsSection({ boats, boatConfigs, onConfigChange, onAddBoat, total, employees, canAssign }: {
  boats: Boat[]
  boatConfigs: Record<string, BoatConfig>
  onConfigChange: (id: string, next: BoatConfig) => void
  onAddBoat: () => void
  total: number
  employees: Employee[]
  canAssign: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Boats & services</Label>
        <button type="button" onClick={onAddBoat} className="text-xs text-primary hover:underline">
          + Add boat
        </button>
      </div>

      {boats.length > 0 ? (
        <div className="space-y-2">
          {boats.map((b) => (
            <BoatRow
              key={b.id}
              boat={b}
              config={boatConfigs[b.id] ?? defaultConfig()}
              onChange={(next) => onConfigChange(b.id, next)}
              employees={employees}
              canAssign={canAssign}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">No boats on file.</p>
          <button
            type="button"
            onClick={onAddBoat}
            className="text-sm text-primary hover:underline mt-1"
          >
            Add the first boat
          </button>
        </div>
      )}

      {total > 0 && (
        <div className="flex justify-end pt-1">
          <p className="text-sm font-semibold">Per visit: ${total.toFixed(2)}</p>
        </div>
      )}
    </div>
  )
}

export default function ServiceForm({
  customers: initialCustomers,
  boatsByCustomer: initialBoatsByCustomer,
  employees,
  canAssign,
  qboItems = [],
}: {
  customers: Customer[]
  boatsByCustomer: Record<string, Boat[]>
  employees: Employee[]
  canAssign: boolean
  qboItems?: { id: string; name: string }[]
}) {
  const [mode, setMode] = useState<'onetime' | 'recurring'>('onetime')
  const [customers, setCustomers] = useState(initialCustomers)
  const [boatsByCustomer, setBoatsByCustomer] = useState(initialBoatsByCustomer)
  const [customerId, setCustomerId] = useState('')
  const [boatConfigs, setBoatConfigs] = useState<Record<string, BoatConfig>>({})
  const [modal, setModal] = useState<{ open: boolean; mode: 'customer' | 'boat' }>({
    open: false,
    mode: 'customer',
  })

  const boats = customerId ? (boatsByCustomer[customerId] ?? []) : []

  const handleCustomerChange = (id: string) => {
    setCustomerId(id)
    const initial: Record<string, BoatConfig> = {}
    for (const b of boatsByCustomer[id] ?? []) {
      initial[b.id] = defaultConfig()
    }
    setBoatConfigs(initial)
  }

  const handleCreatedCustomer = (customer: Customer) => {
    setCustomers((prev) => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)))
    setBoatsByCustomer((prev) => ({ ...prev, [customer.id]: [] }))
    handleCustomerChange(customer.id)
  }

  const handleCreatedBoat = (boat: Boat) => {
    setBoatsByCustomer((prev) => ({
      ...prev,
      [boat.customerId]: [...(prev[boat.customerId] ?? []), boat],
    }))
    setBoatConfigs((prev) => ({ ...prev, [boat.id]: defaultConfig() }))
  }

  const total = boats
    .filter((b) => boatConfigs[b.id]?.included)
    .reduce((sum, b) => {
      const cfg = boatConfigs[b.id]
      const amount = cfg.rateType === 'per_ft'
        ? (b.lengthFt ?? 0) * Number(cfg.rate || 0)
        : Number(cfg.rate || 0)
      return sum + amount
    }, 0)

  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      <form action={createService} className="space-y-6 max-w-xl">
        <input type="hidden" name="mode" value={mode} />

        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border bg-muted p-1 gap-1">
          {(['onetime', 'recurring'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                mode === m
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'onetime' ? 'One-time' : 'Recurring'}
            </button>
          ))}
        </div>

        {/* Customer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="customerId">Customer</Label>
            <button
              type="button"
              onClick={() => setModal({ open: true, mode: 'customer' })}
              className="text-xs text-primary hover:underline"
            >
              + New customer
            </button>
          </div>
          <select
            id="customerId"
            name="customerId"
            required
            value={customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Service type — uses QBO items when synced, fallback to hardcoded list */}
        <div className="space-y-1.5">
          <Label htmlFor="serviceType">Service type</Label>
          <select
            id="serviceType"
            name="serviceType"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a type…</option>
            {qboItems.length > 0
              ? qboItems.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))
              : FALLBACK_SERVICE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))
            }
          </select>
          {qboItems.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sync QBO items in Settings to use your QuickBooks products here.
            </p>
          )}
        </div>

        {mode === 'onetime' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="serviceDate">Date</Label>
              <Input id="serviceDate" name="serviceDate" type="date" required defaultValue={today} />
            </div>

            {customerId && (
              <BoatsSection
                boats={boats}
                boatConfigs={boatConfigs}
                onConfigChange={(id, next) => setBoatConfigs((prev) => ({ ...prev, [id]: next }))}
                onAddBoat={() => setModal({ open: true, mode: 'boat' })}
                total={total}
                employees={employees}
                canAssign={canAssign}
              />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Any special instructions…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <SubmitButton label="Save service" />
              <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" name="startDate" type="date" required defaultValue={today} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dayOfWeek">Day of week</Label>
                <select
                  id="dayOfWeek"
                  name="dayOfWeek"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {DAYS.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="frequencyWeeks">Frequency</Label>
                <select
                  id="frequencyWeeks"
                  name="frequencyWeeks"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="1">Every week</option>
                  <option value="2">Every 2 weeks</option>
                  <option value="3">Every 3 weeks</option>
                  <option value="4">Every 4 weeks</option>
                </select>
              </div>
            </div>

            {customerId && (
              <BoatsSection
                boats={boats}
                boatConfigs={boatConfigs}
                onConfigChange={(id, next) => setBoatConfigs((prev) => ({ ...prev, [id]: next }))}
                onAddBoat={() => setModal({ open: true, mode: 'boat' })}
                total={total}
                employees={employees}
                canAssign={canAssign}
              />
            )}

            <div className="flex items-center gap-3 pt-2">
              <SubmitButton label="Create schedule" />
              <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
            </div>
          </>
        )}
      </form>

      <QuickCreateModal
        open={modal.open}
        onOpenChange={(open) => setModal((m) => ({ ...m, open }))}
        mode={modal.mode}
        customerId={customerId}
        onCreatedCustomer={handleCreatedCustomer}
        onCreatedBoat={handleCreatedBoat}
      />
    </>
  )
}
