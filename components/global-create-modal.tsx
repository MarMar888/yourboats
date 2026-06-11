'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomer, createBoat, getCustomers } from '@/lib/actions/create-entities'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { actionResultError, toastActionResult } from '@/lib/action-toast'

type Step = 'pick' | 'customer' | 'boat'

const OPTIONS = [
  { id: 'service', label: 'Service', description: 'Schedule a one-time or recurring job', icon: '🛥' },
  { id: 'customer', label: 'Customer', description: 'Add a new customer to the system', icon: '👤' },
  { id: 'boat', label: 'Boat', description: 'Add a boat to an existing customer', icon: '⛵' },
] as const

type OptionId = typeof OPTIONS[number]['id']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function CustomerForm({ onSuccess, onCancel }: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createCustomer(data)
      const ok = toastActionResult(result, { success: 'Customer created' })
      if (!ok) { setError(actionResultError(result) ?? 'Failed to create customer'); return }
      formRef.current?.reset()
      onSuccess()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <DialogBody>
        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>}
        <Field label="Full name *"><Input name="name" placeholder="Joe Ryan" required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input name="email" type="email" placeholder="joe@example.com" /></Field>
          <Field label="Phone"><Input name="phone" placeholder="(612) 555-0100" /></Field>
        </div>
        <Field label="Address"><Input name="address" placeholder="20350 Lakeview Ave, Excelsior MN" /></Field>
        <Field label="Notes">
          <textarea name="notes" rows={2} placeholder="Special instructions…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input name="isPrepaid" type="checkbox" className="h-4 w-4 rounded border-input accent-primary" />
          Prepaid customer
        </label>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Back</Button>
        <Button type="submit" disabled={isPending}>{isPending ? 'Creating…' : 'Create customer'}</Button>
      </DialogFooter>
    </form>
  )
}

function BoatForm({ onSuccess, onCancel }: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [customerList, setCustomerList] = useState<{ id: string; name: string }[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    getCustomers().then(setCustomerList)
  }, [])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createBoat(data)
      const ok = toastActionResult(result, { success: 'Boat added' })
      if (!ok) { setError(actionResultError(result) ?? 'Failed to add boat'); return }
      formRef.current?.reset()
      onSuccess()
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <DialogBody>
        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>}
        <Field label="Customer *">
          <select name="customerId" required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Select a customer…</option>
            {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Boat name *"><Input name="nickname" placeholder="SeaRay" required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make & model"><Input name="makeModel" placeholder="Sea-Ray SLX 310" /></Field>
          <Field label="Length (ft)"><Input name="lengthFt" type="number" min="1" max="200" step="1" placeholder="35" /></Field>
        </div>
        <Field label="Notes">
          <textarea name="notes" rows={2} placeholder="Notes about this boat…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Back</Button>
        <Button type="submit" disabled={isPending}>{isPending ? 'Adding…' : 'Add boat'}</Button>
      </DialogFooter>
    </form>
  )
}

export default function GlobalCreateModal({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const router = useRouter()

  const close = () => { onOpenChange(false); setStep('pick') }

  const handlePick = (id: OptionId) => {
    if (id === 'service') { close(); router.push('/schedule/new'); return }
    if (id === 'customer') { setStep('customer'); return }
    if (id === 'boat') { setStep('boat'); return }
  }

  const titles: Record<Step, string> = {
    pick: 'Create new',
    customer: 'New customer',
    boat: 'Add boat',
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[step]}</DialogTitle>
        </DialogHeader>

        {step === 'pick' && (
          <DialogBody>
            <div className="grid gap-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handlePick(opt.id)}
                  className={cn(
                    'flex items-center gap-4 w-full rounded-lg border p-4 text-left transition-colors',
                    'hover:bg-muted hover:border-primary/30'
                  )}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </DialogBody>
        )}

        {step === 'customer' && (
          <CustomerForm onSuccess={close} onCancel={() => setStep('pick')} />
        )}

        {step === 'boat' && (
          <BoatForm onSuccess={close} onCancel={() => setStep('pick')} />
        )}
      </DialogContent>
    </Dialog>
  )
}
