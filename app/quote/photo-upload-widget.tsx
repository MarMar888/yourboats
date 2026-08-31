'use client'

import { useRef, useState } from 'react'
import { Camera, ImageOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MAX_PHOTOS = 8

export function PhotoUploadWidget({
  quoteRequestId,
  initialPhotoUrls = [],
  className,
}: {
  quoteRequestId: string
  initialPhotoUrls?: string[]
  className?: string
}) {
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialPhotoUrls)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const atLimit = photoUrls.length >= MAX_PHOTOS

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError('')
    setIsUploading(true)

    try {
      for (const file of Array.from(files)) {
        if (photoUrls.length >= MAX_PHOTOS) {
          setError(`You can upload up to ${MAX_PHOTOS} photos.`)
          break
        }
        const formData = new FormData()
        formData.append('photo', file)
        const res = await fetch(`/api/quote-requests/${quoteRequestId}/photos`, {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Upload failed. Try again.')
          continue
        }
        setPhotoUrls(data.photoUrls)
      }
    } catch {
      setError('Upload failed. Check your connection and try again.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {photoUrls.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photoUrls.map((url, i) => (
            // Blobs are private; rendered through the index-based read proxy, not the raw blob url.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={`/api/quote-requests/${quoteRequestId}/photos/${i}`}
              alt="Boat photo"
              className="aspect-square w-full rounded-md border object-cover"
            />
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        id={`photo-input-${quoteRequestId}`}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isUploading || atLimit}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {isUploading ? 'Uploading…' : atLimit ? 'Photo limit reached' : photoUrls.length > 0 ? 'Add more photos' : 'Add photos'}
      </Button>

      {error && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
