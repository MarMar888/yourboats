'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { updateCustomer } from './update-customer-action'
import { actionResultError, runToastAction } from '@/lib/action-toast'

interface EditCustomerModalProps {
  customerId: string
  initialValues: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
  }
}

export function EditCustomerModal({ customerId, initialValues }: EditCustomerModalProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(initialValues.name)
  const [phone, setPhone] = useState(initialValues.phone ?? '')
  const [email, setEmail] = useState(initialValues.email ?? '')
  const [address, setAddress] = useState(initialValues.address ?? '')

  function handleOpen() {
    // Reset to current values each time the modal opens
    setName(initialValues.name)
    setPhone(initialValues.phone ?? '')
    setEmail(initialValues.email ?? '')
    setAddress(initialValues.address ?? '')
    setError(null)
    setOpen(true)
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.')
      toast.error('Name is required.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await updateCustomer(customerId, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
      })
      const ok = await runToastAction(async () => result, { success: 'Customer updated', error: 'Failed to update customer' })
      if (!ok) {
        setError(actionResultError(result) ?? 'Failed to update customer')
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>

          <div className="px-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Joe Ryan"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joe@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(612) 555-0100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="20350 Lakeview Ave, Excelsior MN 55331"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
