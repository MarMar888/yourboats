'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { ElapsedTimer } from '@/components/elapsed-timer'
import { getActiveClockins } from '@/app/(app)/time/actions'
import type { ActiveClockIn } from '@/app/(app)/time/actions'

const ClockInsContext = createContext<ActiveClockIn[]>([])

export function LiveClockInsProvider({
  entries: initial,
  children,
}: {
  entries: ActiveClockIn[]
  children: React.ReactNode
}) {
  const [entries, setEntries] = useState(initial)

  // Sync when the server layout re-renders with fresh initial data (e.g. on navigation)
  useEffect(() => { setEntries(initial) }, [initial])

  // Single polling interval shared by all consumers
  useEffect(() => {
    const id = setInterval(async () => {
      try { setEntries(await getActiveClockins()) } catch {}
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  return <ClockInsContext.Provider value={entries}>{children}</ClockInsContext.Provider>
}

function ClockInCard({ entry }: { entry: ActiveClockIn }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight truncate">{entry.employeeName ?? 'Unknown'}</p>
        <span className="shrink-0 text-xs font-mono text-primary tabular-nums">
          <ElapsedTimer clockIn={entry.clockIn} />
        </span>
      </div>
      {(entry.customerName || entry.boatName) && (
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {[entry.customerName, entry.boatName].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

export function LiveClockInsPanel() {
  const entries = useContext(ClockInsContext)
  if (entries.length === 0) return null
  return (
    <aside className="hidden 2xl:flex w-52 shrink-0 flex-col gap-2 border-l px-3 py-5 sticky top-0 self-start max-h-svh overflow-y-auto">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live · {entries.length}
        </span>
      </div>
      {entries.map((entry) => (
        <ClockInCard key={entry.id} entry={entry} />
      ))}
    </aside>
  )
}

export function LiveClockInsWidget() {
  const entries = useContext(ClockInsContext)
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null
  return (
    <div className="fixed bottom-6 right-6 z-20 hidden xl:flex 2xl:hidden flex-col items-end gap-2">
      {open && (
        <div className="flex flex-col gap-2 w-52">
          {entries.map((entry) => (
            <ClockInCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-semibold shadow-md hover:bg-muted transition-colors"
      >
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          {entries.length} live
        </span>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronUp className="h-3 w-3 text-muted-foreground" />}
      </button>
    </div>
  )
}
