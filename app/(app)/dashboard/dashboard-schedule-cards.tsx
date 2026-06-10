'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import ScheduleCard from '@/app/(app)/schedule/schedule-card'
import type { ScheduleCardEmployee, ReminderStatus } from '@/app/(app)/schedule/schedule-card'
import { markComplete, deleteService } from '@/app/(app)/schedule/actions'

type CardData = {
  id: string
  customerId: string
  customerName: string
  customerNotes: string | null
  customerAddress: string | null
  serviceType: string
  serviceDate: string
  status: string
  notes: string | null
  totalPrice: string | null
  approvedAt: Date | null
  reminderStatus: ReminderStatus
  reminderSentAt: Date | null
  completionPhotoUrl: string | null
  boats: { boatId: string; nickname: string; boatNotes: string | null; serviceBoatNotes: string | null; assignedIds: string[] }[]
}

export function DashboardScheduleCards({
  cards,
  employees,
  isManager,
}: {
  cards: CardData[]
  employees: ScheduleCardEmployee[]
  isManager: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function handleComplete(serviceId: string) {
    startTransition(async () => {
      await markComplete(serviceId)
      router.refresh()
    })
  }

  function handleDelete(serviceId: string) {
    startTransition(async () => {
      await deleteService(serviceId)
      router.refresh()
    })
  }

  return (
    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((svc) => (
        <ScheduleCard
          key={svc.id}
          serviceId={svc.id}
          customerId={svc.customerId}
          customerName={svc.customerName}
          customerNotes={svc.customerNotes}
          customerAddress={svc.customerAddress}
          serviceType={svc.serviceType}
          serviceDate={svc.serviceDate}
          status={svc.status}
          notes={svc.notes}
          totalPrice={svc.totalPrice}
          approvedAt={svc.approvedAt}
          reminderStatus={svc.reminderStatus}
          reminderSentAt={svc.reminderSentAt}
          completionPhotoUrl={svc.completionPhotoUrl}
          boats={svc.boats}
          employees={employees}
          isManager={isManager}
          onComplete={handleComplete}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}
