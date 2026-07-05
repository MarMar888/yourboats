'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import ScheduleCard from '@/app/(app)/schedule/schedule-card'
import type { ScheduleCardEmployee, ReminderStatus } from '@/app/(app)/schedule/schedule-card'
import { markComplete, deleteService } from '@/app/(app)/schedule/actions'
import { CompletionPhotoModal } from '@/app/(app)/schedule/completion-photo-modal'

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
  firstPhotoId: string | null
  photoCount: number
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

  // Completion requires a photo every time — same flow as the schedule page:
  // clicking Complete opens the photo modal, and the service is only marked
  // complete after a photo is uploaded.
  const [photoModalFor, setPhotoModalFor] = useState<{ id: string; customerName: string } | null>(null)

  function handleComplete(serviceId: string) {
    const card = cards.find((c) => c.id === serviceId)
    setPhotoModalFor({ id: serviceId, customerName: card?.customerName ?? '' })
  }

  function finishComplete(serviceId: string) {
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
    <>
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
            firstPhotoId={svc.firstPhotoId}
            photoCount={svc.photoCount}
            boats={svc.boats}
            employees={employees}
            isManager={isManager}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {photoModalFor && (
        <CompletionPhotoModal
          serviceId={photoModalFor.id}
          customerName={photoModalFor.customerName}
          onPhotoSaved={() => {
            const id = photoModalFor.id
            setPhotoModalFor(null)
            finishComplete(id)
          }}
          onClose={() => setPhotoModalFor(null)}
        />
      )}
    </>
  )
}
