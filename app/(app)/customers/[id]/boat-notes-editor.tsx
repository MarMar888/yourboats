'use client'

import { InlineNotesEditor } from '@/components/inline-notes-editor'
import { updateBoatNotes } from './notes-actions'

interface Props {
  boatId: string
  customerId: string
  notes: string | null
}

export function BoatNotesEditor({ boatId, customerId, notes }: Props) {
  return (
    <InlineNotesEditor
      notes={notes}
      label="Boat notes"
      placeholder="Add boat notes…"
      variant="plain"
      onSave={(val) => updateBoatNotes(boatId, customerId, val)}
    />
  )
}
