'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateBoat, deleteBoat } from './boat-actions'

type BoatData = {
  id: string
  nickname: string
  makeModel: string | null
  lengthFt: number | null
  notes: string | null
}

export function EditBoatModal({
  boat,
  customerId,
}: {
  boat: BoatData
  customerId: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDelete] = useTransition()
  const router = useRouter()

  function handleOpen() {
    setOpen(true)
    setConfirmDelete(false)
    setError('')
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    const lengthRaw = (data.get('lengthFt') as string).trim()
    const lengthFt = lengthRaw ? parseInt(lengthRaw, 10) : null
    startTransition(async () => {
      const result = await updateBoat(boat.id, customerId, {
        nickname: (data.get('nickname') as string).trim(),
        makeModel: (data.get('makeModel') as string).trim() || null,
        lengthFt: lengthFt !== null && !isNaN(lengthFt) ? lengthFt : null,
        notes: (data.get('notes') as string).trim() || null,
      })
      if (!result.ok) { setError(result.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deleteBoat(boat.id, customerId)
      if (!result.ok) { setError(result.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={handleOpen}
      >
        Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit boat</DialogTitle>
            <DialogDescription>Update details for {boat.nickname}.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="space-y-1.5">
                <Label>Boat name / nickname *</Label>
                <Input name="nickname" defaultValue={boat.nickname} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Make &amp; model</Label>
                  <Input
                    name="makeModel"
                    defaultValue={boat.makeModel ?? ''}
                    placeholder="Sea-Ray SLX 310"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Length (ft)</Label>
                  <Input
                    name="lengthFt"
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    defaultValue={boat.lengthFt ?? ''}
                    placeholder="35"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={boat.notes ?? ''}
                  placeholder="Any notes about this boat…"
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              {/* Delete section */}
              <div className="pt-2 border-t">
                {!confirmDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 px-0"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete boat
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-destructive font-medium">
                      Delete this boat? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={isDeleting}
                        onClick={handleDelete}
                      >
                        {isDeleting ? 'Deleting…' : 'Yes, delete'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
