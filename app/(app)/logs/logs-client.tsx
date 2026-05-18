'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

type LogRow = {
  id: string
  userId: string | null
  action: string
  entityType: string | null
  entityId: string | null
  metadata: string | null
  error: string | null
  createdAt: Date
  displayName: string | null
}

function formatDate(d: Date): string {
  const date = new Date(d)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function MetadataDisplay({ raw }: { raw: string | null }) {
  const meta = parseMetadata(raw)
  if (!meta) return null
  const entries = Object.entries(meta)
  if (entries.length === 0) return null
  return (
    <span className="text-xs text-muted-foreground">
      {entries.map(([k, v]) => `${k}=${String(v)}`).join(' · ')}
    </span>
  )
}

export default function LogsClient({
  rows,
  distinctActions,
}: {
  rows: LogRow[]
  distinctActions: string[]
}) {
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (actionFilter !== 'all' && row.action !== actionFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const name = (row.displayName ?? row.userId ?? '').toLowerCase()
        const action = row.action.toLowerCase()
        const entity = `${row.entityType ?? ''} ${row.entityId ?? ''}`.toLowerCase()
        if (!name.includes(q) && !action.includes(q) && !entity.includes(q)) return false
      }
      return true
    })
  }, [rows, actionFilter, search])

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All actions</option>
          {distinctActions.map((a) => (
            <option key={a} value={a}>
              {formatAction(a)}
            </option>
          ))}
        </select>

        <Input
          placeholder="Search user, action, entity…"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">
                Date / Time
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                User
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                Action
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                Entity
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No log entries found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b last:border-0 hover:bg-muted/30 transition-colors',
                    row.error && 'bg-destructive/5 hover:bg-destructive/10'
                  )}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.displayName ?? (
                      <span className="text-muted-foreground text-xs font-mono">
                        {row.userId ? row.userId.slice(0, 8) : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        row.error
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-secondary text-secondary-foreground'
                      )}
                    >
                      {formatAction(row.action)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground font-mono">
                    {row.entityType && (
                      <>
                        <span>{row.entityType}</span>
                        {row.entityId && (
                          <span className="ml-1 opacity-60">
                            {row.entityId.slice(0, 8)}
                          </span>
                        )}
                      </>
                    )}
                    {!row.entityType && '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.error ? (
                      <span className="text-xs text-destructive">{row.error}</span>
                    ) : (
                      <MetadataDisplay raw={row.metadata} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
