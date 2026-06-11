'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { addReminderContact, deleteReminderContact } from './reminder-contacts-actions'
import type { CustomerReminderContact } from '@/lib/db/schema'

interface Props {
  customerId: string
  contacts: CustomerReminderContact[]
}

export default function ReminderContacts({ customerId, contacts }: Props) {
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.')
      toast.error('Enter a valid email address.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await addReminderContact(customerId, trimmed, label.trim() || null)
        setEmail('')
        setLabel('')
        toast.success('Reminder contact added')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add reminder contact')
      }
    })
  }

  function handleDelete(contactId: string) {
    startTransition(async () => {
      try {
        await deleteReminderContact(contactId, customerId)
        toast.success('Reminder contact removed')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove reminder contact')
      }
    })
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No additional reminder contacts.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.email}</p>
                {c.label && (
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive shrink-0"
                onClick={() => handleDelete(c.id)}
                disabled={isPending}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="text"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full sm:w-40 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="sm" disabled={isPending || !email.trim()}>
          Add
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
