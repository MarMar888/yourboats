'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  serviceId: string
  customerName: string
  submitLabel?: string
  onPhotoSaved: (photoUrl: string) => void
  /** When provided, shows a "Complete without photo" option (photo is optional). */
  onSkip?: () => void
  onClose: () => void
}

export function CompletionPhotoModal({ serviceId, customerName, submitLabel = 'Upload & complete', onPhotoSaved, onSkip, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Photo must be under 10 MB.')
      return
    }
    setError('')
    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('photo', selectedFile)
      const res = await fetch(`/api/services/${serviceId}/photo`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        // Body may not be JSON (e.g. a 413 from the platform's request-size
        // limit returns plain text) — Safari's res.json() would otherwise throw
        // "The string did not match the expected pattern".
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(
          body.error ?? (res.status === 413 ? 'Photo is too large to upload' : 'Upload failed')
        )
      }
      const { url } = await res.json() as { url: string }
      onPhotoSaved(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        {/* Header */}
        <div>
          <h2 className="text-base font-semibold">Add completion photo</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {customerName}
            {onSkip && ' · optional'}
          </p>
        </div>

        {/* Photo picker */}
        {!preview ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 py-10 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <span className="text-3xl">📷</span>
            <span className="text-sm text-muted-foreground font-medium">Tap to take or choose a photo</span>
            <span className="text-xs text-muted-foreground">Max 10 MB</span>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="w-full max-h-64 object-cover rounded-xl" />
            <button
              onClick={() => { setPreview(null); setSelectedFile(null) }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-black/80 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Hidden file input — lets iOS show "Take Photo / Photo Library" sheet */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            disabled={!selectedFile || uploading}
            onClick={handleUpload}
            className={cn(
              'w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              selectedFile && !uploading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-primary/40 text-primary-foreground cursor-not-allowed'
            )}
          >
            {uploading ? 'Uploading…' : submitLabel}
          </button>
          {onSkip && (
            <button
              disabled={uploading}
              onClick={onSkip}
              className="w-full inline-flex items-center justify-center rounded-lg border border-input px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
            >
              Complete without photo
            </button>
          )}
          <button
            disabled={uploading}
            onClick={onClose}
            className="w-full inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
