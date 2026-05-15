'use client'

import { useState, useTransition, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomer, createBoat } from '@/lib/actions/create-entities'
import type { Customer, Boat } from '@/lib/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'customer' | 'boat'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  // Pre-selected customer when adding a boat
  customerId?: string
  onCreatedCustomer?: (customer: Customer) => void
  onCreatedBoat?: (boat: Boat) => void
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

// ─── Customer form ────────────────────────────────────────────────────────────

function CustomerForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (c: Customer) => void
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
      if (!result.ok) { setError(result.error); return }
      formRef.current?.reset()
      onSuccess(result.customer)
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <DialogBody>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
        )}

        <Field label="Full name *">
          <Input name="name" placeholder="Joe Ryan" required />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email">
            <Input name="email" type="email" placeholder="joe@example.com" />
          </Field>
          <Field label="Phone">
            <Input name="phone" placeholder="(612) 555-0100" />
          </Field>
        </div>

        <Field label="Address">
          <Input name="address" placeholder="20350 Lakeview Ave, Excelsior MN 55331" />
        </Field>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={2}
            placeholder="Any special instructions…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input name="isPrepaid" type="checkbox" className="h-4 w-4 rounded border-input accent-primary" />
          Prepaid customer
        </label>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create customer'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Boat form ────────────────────────────────────────────────────────────────

function BoatForm({
  customerId,
  onSuccess,
  onCancel,
}: {
  customerId: string
  onSuccess: (b: Boat) => void
  onCancel: () => void
}) {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    data.set('customerId', customerId)
    startTransition(async () => {
      const result = await createBoat(data)
      if (!result.ok) { setError(result.error); return }
      formRef.current?.reset()
      onSuccess(result.boat)
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <DialogBody>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
        )}

        <Field label="Boat name / nickname *">
          <Input name="nickname" placeholder="SeaRay" required />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Make & model">
            <Input name="makeModel" placeholder="Sea-Ray SLX 310" />
          </Field>
          <Field label="Length (ft)">
            <Input name="lengthFt" type="number" min="1" max="200" step="0.5" placeholder="35" />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={2}
            placeholder="Any notes about this boat…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </Field>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add boat'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function QuickCreateModal({
  open,
  onOpenChange,
  mode,
  customerId = '',
  onCreatedCustomer,
  onCreatedBoat,
}: Props) {
  const title = mode === 'customer' ? 'New customer' : 'Add boat'
  const description =
    mode === 'customer'
      ? 'Customer will be saved locally and pushed to QuickBooks.'
      : 'Boat will be added to this customer.'

  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === 'customer' ? (
          <CustomerForm
            onSuccess={(c) => { onCreatedCustomer?.(c); close() }}
            onCancel={close}
          />
        ) : (
          <BoatForm
            customerId={customerId}
            onSuccess={(b) => { onCreatedBoat?.(b); close() }}
            onCancel={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
