'use client'

import { InlineNotesEditor } from '@/components/inline-notes-editor'
import { updateCustomerNotes } from './notes-actions'

interface Props {
  customerId: string
  notes: string | null
}

export function CustomerNotesEditor({ customerId, notes }: Props) {
  return (
    <InlineNotesEditor
      notes={notes}
      label="Notes / Gate code"
      placeholder="Add notes or gate code…"
      variant="yellow"
      onSave={(val) => updateCustomerNotes(customerId, val)}
    />
  )
}
