'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus } from 'lucide-react'
import { CompletionPhotoModal } from '../completion-photo-modal'

interface Photo {
  id: string
}

interface Props {
  serviceId: string
  customerName: string
  photos: Photo[]
}

export function CompletionPhotoGallery({ serviceId, customerName, photos }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function handleDelete(photoId: string) {
    setDeletingId(photoId)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/services/${serviceId}/photos/${photoId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setDeleteError(body.error ?? 'Failed to delete photo')
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setDeleteError('Failed to delete photo')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="lg:sticky lg:top-6">
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-xs font-medium text-muted-foreground">
            Completion photo{photos.length !== 1 ? 's' : ''}
            {photos.length > 1 && (
              <span className="ml-1 text-muted-foreground/60">({photos.length})</span>
            )}
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        {deleteError && (
          <p className="px-3 py-2 text-xs text-destructive bg-destructive/10 border-b">{deleteError}</p>
        )}

        <div className={photos.length > 1 ? 'grid grid-cols-2 gap-0.5 bg-border' : ''}>
          {photos.map((photo) => (
            <div key={photo.id} className="relative group bg-card">
              <a
                href={`/api/services/${serviceId}/photos/${photo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open full size"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/services/${serviceId}/photos/${photo.id}`}
                  alt="Service completion photo"
                  className="w-full object-cover hover:opacity-90 transition-opacity"
                  style={{ aspectRatio: '4/3' }}
                />
              </a>
              {/* Always visible on touch devices; hover-only on pointer devices */}
              <button
                onClick={() => handleDelete(photo.id)}
                disabled={deletingId === photo.id}
                className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80 disabled:opacity-40 [@media(hover:none)]:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                title="Delete photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {photos.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No photos yet
          </div>
        )}
      </div>

      {showModal && (
        <CompletionPhotoModal
          serviceId={serviceId}
          customerName={customerName}
          submitLabel="Upload photo"
          onPhotoSaved={() => {
            setShowModal(false)
            startTransition(() => router.refresh())
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
