'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
    )
  }

  return (
    <div className="rounded-lg border bg-card px-4 py-4 mt-4">
      <h2 className="text-base font-semibold mb-4">Edit service</h2>
      <EditServiceForm
        serviceId={serviceId}
        initialValues={initialValues}
        boats={boats}
        allCustomerBoats={allCustomerBoats}
        employees={employees}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}
