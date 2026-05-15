'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import QuickCreateModal from '@/components/quick-create-modal'

export default function AddBoatButton({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + Add boat
      </Button>
      <QuickCreateModal
        open={open}
        onOpenChange={setOpen}
        mode="boat"
        customerId={customerId}
        onCreatedBoat={() => {
          setOpen(false)
          router.refresh()
        }}
      />
    </>
  )
}
