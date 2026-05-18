'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface InlineNotesEditorProps {
  notes: string | null
  onSave: (notes: string) => Promise<void>
  placeholder?: string
  label?: string
  /** visual style wrapper — matches the yellow card used on detail pages */
  variant?: 'yellow' | 'plain'
}

export function InlineNotesEditor({
  notes,
  onSave,
  placeholder = 'Add notes…',
  label = 'Notes',
  variant = 'yellow',
}: InlineNotesEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(notes ?? '')
  const [optimistic, setOptimistic] = useState(notes ?? '')
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus()
      // Move cursor to end
      const len = textareaRef.current?.value.length ?? 0
      textareaRef.current?.setSelectionRange(len, len)
    }
  }, [editing])

  function handleEdit() {
    setValue(optimistic)
    setEditing(true)
  }

  function handleCancel() {
    setValue(optimistic)
    setEditing(false)
  }

  function handleSave() {
    const trimmed = value.trim()
    setOptimistic(trimmed)
    setEditing(false)
    startTransition(async () => {
      await onSave(trimmed)
    })
  }

  if (editing) {
    return (
      <div className="space-y-2">
        {variant === 'yellow' && (
          <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">{label}</p>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancel()
            // Ctrl/Cmd+Enter to save
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave()
          }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
            ⌘↵ to save · Esc to cancel
          </span>
        </div>
      </div>
    )
  }

  if (variant === 'yellow') {
    return (
      <div className="group relative rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">{label}</p>
          <button
            onClick={handleEdit}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-600 hover:text-yellow-800 p-0.5 rounded shrink-0"
            title="Edit notes"
          >
            <PencilIcon />
          </button>
        </div>
        {optimistic ? (
          <p className="text-sm text-yellow-900 whitespace-pre-wrap">{optimistic}</p>
        ) : (
          <button
            onClick={handleEdit}
            className="text-sm text-yellow-600 italic hover:underline"
          >
            {placeholder}
          </button>
        )}
      </div>
    )
  }

  // plain variant
  return (
    <div className="group flex items-start gap-2">
      <div className="flex-1 min-w-0">
        {optimistic ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{optimistic}</p>
        ) : (
          <span className="text-sm text-muted-foreground/50 italic">{placeholder}</span>
        )}
      </div>
      <button
        onClick={handleEdit}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 rounded shrink-0 mt-0.5"
        title="Edit notes"
      >
        <PencilIcon />
      </button>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}
