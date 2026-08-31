'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Search, Sparkles, X } from 'lucide-react'
import { getBoatType } from '@/lib/quote/boat-types'
import type { BoatSuggestion } from '@/lib/quote/boat-model-match'
import { cn } from '@/lib/utils'
import { searchBoatModelsAction } from './actions'

export function BoatSearch({
  matched,
  onMatch,
  onClear,
}: {
  matched: BoatSuggestion | null
  onMatch: (row: BoatSuggestion) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BoatSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [searched, setSearched] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryRef = useRef(query)
  queryRef.current = query

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      setOpen(false)
      setSearched(false)
      return
    }
    const searchedQuery = query
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const rows = await searchBoatModelsAction(searchedQuery)
        // A slower request (e.g. the AI fallback) for an earlier keystroke
        // can resolve after a faster one for a newer query; drop it if the
        // user has since typed something else.
        if (queryRef.current !== searchedQuery) return
        setResults(rows)
        setSearched(true)
        setOpen(true)
      })
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  if (matched) {
    const type = getBoatType(matched.boatTypeKey)
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {matched.make} {matched.model}
            </p>
            {matched.source === 'ai' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                AI best guess
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {matched.source === 'ai' ? 'Estimated as' : 'Matched to'} {type?.label ?? matched.boatTypeKey} ·{' '}
            {matched.lengthFt} ft, edit below if needed
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search your boat by make and model"
          className="flex h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {isPending && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Checking…
          </span>
        )}
      </div>

      {open && (
        <div
          className={cn(
            'absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-lg',
            results.length === 0 && 'p-3.5'
          )}
        >
          {results.length > 0
            ? results.map((r) => {
                const type = getBoatType(r.boatTypeKey)
                return (
                  <button
                    key={r.id ?? `ai-${r.make}-${r.model}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onMatch(r)
                      setQuery('')
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {r.source === 'ai' && <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                      {r.make} {r.model}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {type?.label ?? r.boatTypeKey} · {r.lengthFt} ft
                    </span>
                  </button>
                )
              })
            : searched &&
              !isPending && (
                <p className="text-sm text-muted-foreground">
                  No exact match. Pick the closest type below.
                </p>
              )}
        </div>
      )}
    </div>
  )
}
