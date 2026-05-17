'use client'

import { InlineNotesEditor } from '@/components/inline-notes-editor'
import { updateServiceNotes } from './notes-actions'

interface Props {
  serviceId: string
  notes: string | null
}

export function ServiceNotesEditor({ serviceId, notes }: Props) {
  return (
    <InlineNotesEditor
      notes={notes}
      label="Service notes"
      placeholder="Add service notes…"
      variant="yellow"
      onSave={(val) => updateServiceNotes(serviceId, val)}
    />
  )
}
