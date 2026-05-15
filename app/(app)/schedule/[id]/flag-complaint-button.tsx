'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import LogComplaintModal from '@/components/log-complaint-modal'

interface FlagComplaintButtonProps {
  serviceId: string
  customerId: string
}

export default function FlagComplaintButton({
  serviceId,
  customerId,
}: FlagComplaintButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Flag complaint
      </Button>
      <LogComplaintModal
        serviceId={serviceId}
        customerId={customerId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
