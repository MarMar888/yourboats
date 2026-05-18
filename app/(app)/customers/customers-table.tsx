'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export type CustomerRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  isPrepaid: boolean
  boatCount: number
  totalServices: number
  thisSeasonServices: number
}

type SortKey = 'name' | 'boatCount' | 'totalServices' | 'thisSeasonServices'
type SortDir = 'asc' | 'desc'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 opacity-20">↕</span>
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const rows = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.phone?.toLowerCase().includes(q)
        )
      : customers

    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else {
        cmp = a[sortKey] - b[sortKey]
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [customers, query, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th
      className={`px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => toggleSort(key)}
    >
      {label}
      <SortIcon active={sortKey === key} dir={sortDir} />
    </th>
  )

  return (
    <div className="space-y-3">
      <Input
        type="search"
        placeholder="Search by name, email, or phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {query ? 'No customers match your search.' : 'No customers yet.'}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {th('name', 'Customer', 'left')}
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                  Contact
                </th>
                {th('boatCount', 'Boats')}
                {th('totalServices', 'Services')}
                {th('thisSeasonServices', 'This season')}
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap">
                  Status
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40 transition-colors group">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                    <div className="space-y-0.5">
                      {c.email && <p>{c.email}</p>}
                      {c.phone && <p className="text-xs">{c.phone}</p>}
                      {!c.email && !c.phone && <span className="text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {c.boatCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {c.totalServices}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {c.thisSeasonServices}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.isPrepaid ? (
                      <Badge className="bg-blue-100 text-blue-800 border-0 text-xs">
                        Prepaid
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 max-w-[220px]">
                    {c.notes ? (
                      <p className="text-xs text-muted-foreground truncate" title={c.notes}>
                        {c.notes}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
            {query && ` of ${customers.length} total`}
          </div>
        </div>
      )}
    </div>
  )
}
