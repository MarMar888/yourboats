'use client'

import { useState, useTransition, useRef } from 'react'
import { toast } from 'sonner'
import { createCalendarEvent, deleteCalendarEvent } from './actions'

const COLORS = [
  { value: 'blue',   label: 'Blue',   dot: 'bg-blue-400' },
  { value: 'green',  label: 'Green',  dot: 'bg-green-400' },
  { value: 'red',    label: 'Red',    dot: 'bg-red-400' },
  { value: 'yellow', label: 'Yellow', dot: 'bg-yellow-400' },
  { value: 'purple', label: 'Purple', dot: 'bg-purple-400' },
]

export function AddEventButton({ defaultDate }: { defaultDate?: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createCalendarEvent(data)
      if (result.ok) {
        setOpen(false)
        formRef.current?.reset()
        toast.success('Calendar event added')
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        + Add event
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-card border rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Add calendar event</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Title *</label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Team meeting, Day off…"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Date *</label>
                  <input
                    type="date"
                    name="eventDate"
                    required
                    defaultValue={defaultDate}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">End date (optional)</label>
                  <input
                    type="date"
                    name="endDate"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Color</label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <label key={c.value} className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name="color" value={c.value} defaultChecked={c.value === 'blue'} className="sr-only peer" />
                      <span className={`w-6 h-6 rounded-full ${c.dot} peer-checked:ring-2 peer-checked:ring-offset-1 peer-checked:ring-foreground/40 transition-all`} title={c.label} />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Notes (optional)</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Any extra details…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-sm rounded-md border border-input hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {pending ? 'Saving…' : 'Add event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function DeleteEventButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      onClick={() => startTransition(async () => {
        try {
          await deleteCalendarEvent(id)
          toast.success('Calendar event deleted')
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to delete calendar event')
        }
      })}
      disabled={pending}
      className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-destructive leading-none px-0.5"
      title="Delete event"
    >
      ×
    </button>
  )
}
