'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PreviewRow {
  to: string
  customer: string
  serviceDate: string
  boats: string[]
  serviceIds: string[]
}

interface RunResult {
  sent: number
  skipped: number
  errors: string[]
  dryRun: boolean
  targetDate: string | null
  preview?: PreviewRow[]
}

function todayPlus1(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function ReminderTestPanel() {
  const [date, setDate] = useState(todayPlus1)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(dryRun: boolean) {
    setPending(true)
    setResult(null)
    setError(null)
    try {
      const params = new URLSearchParams({ date, dryRun: String(dryRun) })
      const res = await fetch(`/api/cron/reminders?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
      } else {
        setResult(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reminder-date">Service date to target</Label>
          <Input
            id="reminder-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
        <Button variant="outline" onClick={() => run(true)} disabled={pending || !date}>
          {pending ? 'Checking…' : 'Dry run'}
        </Button>
        <Button onClick={() => run(false)} disabled={pending || !date}>
          {pending ? 'Sending…' : 'Send now'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Dry run shows who would receive a reminder without sending. Send now delivers real emails and stamps each service with the sent timestamp.
      </p>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border bg-card p-4 space-y-3 text-sm">
          <div className="flex items-center gap-4">
            {result.dryRun ? (
              <span className="font-medium text-amber-700">Dry run — nothing sent</span>
            ) : (
              <span className="font-medium text-green-700">
                {result.sent} {result.sent === 1 ? 'email' : 'emails'} sent
              </span>
            )}
            {result.errors.length > 0 && (
              <span className="text-destructive">{result.errors.length} failed</span>
            )}
          </div>

          {/* Dry-run preview */}
          {result.preview && result.preview.length > 0 && (
            <div className="divide-y rounded-md border overflow-hidden">
              {result.preview.map((row) => (
                <div key={row.serviceIds.join(',')} className="px-3 py-2.5 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{row.customer}</p>
                    {row.boats.length > 0 && (
                      <p className="text-xs text-muted-foreground">{row.boats.join(', ')}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{row.to}</p>
                </div>
              ))}
            </div>
          )}

          {result.preview && result.preview.length === 0 && (
            <p className="text-muted-foreground">No approved scheduled services found for {result.targetDate ?? date}.</p>
          )}

          {/* Error list */}
          {result.errors.length > 0 && (
            <div className="space-y-1">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
