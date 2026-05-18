'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EditServiceForm } from './edit-service-form'

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

type Props = {
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
}

export function EditServicePanel({ serviceId, initialValues, boats, allCustomerBoats, employees }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Edit service</DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-6 py-5">
            <EditServiceForm
              serviceId={serviceId}
              initialValues={initialValues}
              boats={boats}
              allCustomerBoats={allCustomerBoats}
              employees={employees}
              onClose={() => setOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
