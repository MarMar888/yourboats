'use client'

import { useState } from 'react'

type Boat = {
  nickname: string
  makeModel: string | null
  lengthFt: number | null
  notes: string | null
}

type RecurringSchedule = {
  serviceType: string
  frequencyWeeks: number
  dayOfWeek: number   // 0=Sun … 6=Sat
  startDate: string
  endDate: string | null
  active: boolean
}

type ServiceRow = {
  serviceDate: string
  serviceType: string
  status: string
  totalPrice: string | null
  boats: string[]
}

type InvoiceRow = {
  serviceDate: string
  serviceType: string
  status: string
  amount: string
  sentAt: Date | null
  paidAt: Date | null
}

type Props = {
  customerName: string
  notes: string | null
  isPrepaid: boolean
  boats: Boat[]
  recurringSchedules: RecurringSchedule[]
  scheduledServices: ServiceRow[]
  recentServices: ServiceRow[]
  invoices: InvoiceRow[]
}

function fmtDate(d: string | Date) {
  const s = typeof d === 'string' ? d : d.toISOString().split('T')[0]
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildText(p: Props): string {
  const lines: string[] = []

  lines.push(`CUSTOMER CONTEXT: ${p.customerName}`)
  lines.push('='.repeat(50))
  if (p.isPrepaid) lines.push('⭐ Prepaid customer')
  if (p.notes) {
    lines.push('')
    lines.push('NOTES / GATE CODE')
    lines.push(p.notes)
  }

  // Boats
  lines.push('')
  lines.push('BOATS')
  lines.push('-'.repeat(30))
  if (p.boats.length === 0) {
    lines.push('  No boats on file.')
  } else {
    for (const b of p.boats) {
      const parts = [b.nickname]
      if (b.makeModel) parts.push(b.makeModel)
      if (b.lengthFt) parts.push(`${b.lengthFt} ft`)
      lines.push(`  • ${parts.join(' · ')}`)
      if (b.notes) lines.push(`    Notes: ${b.notes}`)
    }
  }

  // Recurring schedules
  if (p.recurringSchedules.length > 0) {
    lines.push('')
    lines.push('RECURRING SCHEDULES')
    lines.push('-'.repeat(30))
    for (const s of p.recurringSchedules) {
      const status = s.active ? 'Active' : 'Inactive'
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.dayOfWeek] ?? String(s.dayOfWeek)
      const freq = s.frequencyWeeks === 1 ? 'weekly' : `every ${s.frequencyWeeks} weeks`
      lines.push(`  • ${fmtType(s.serviceType)} — ${dayName}s ${freq} [${status}]`)
      lines.push(`    From ${fmtDate(s.startDate)}${s.endDate ? ` through ${fmtDate(s.endDate)}` : ''}`)
    }
  }

  // Upcoming services
  lines.push('')
  lines.push('UPCOMING SERVICES')
  lines.push('-'.repeat(30))
  if (p.scheduledServices.length === 0) {
    lines.push('  None scheduled.')
  } else {
    for (const s of p.scheduledServices) {
      const price = s.totalPrice ? ` — $${Number(s.totalPrice).toFixed(2)}` : ''
      const boats = s.boats.length > 0 ? ` (${s.boats.join(', ')})` : ''
      lines.push(`  • ${fmtDate(s.serviceDate)} — ${fmtType(s.serviceType)}${boats}${price}`)
    }
  }

  // Service history
  lines.push('')
  lines.push('SERVICE HISTORY (last 20)')
  lines.push('-'.repeat(30))
  if (p.recentServices.length === 0) {
    lines.push('  No history.')
  } else {
    for (const s of p.recentServices) {
      const price = s.totalPrice ? ` — $${Number(s.totalPrice).toFixed(2)}` : ''
      const boats = s.boats.length > 0 ? ` (${s.boats.join(', ')})` : ''
      const status = s.status !== 'complete' ? ` [${s.status}]` : ''
      lines.push(`  • ${fmtDate(s.serviceDate)} — ${fmtType(s.serviceType)}${boats}${price}${status}`)
    }
  }

  // Invoices
  lines.push('')
  lines.push('INVOICES')
  lines.push('-'.repeat(30))
  if (p.invoices.length === 0) {
    lines.push('  No invoices.')
  } else {
    for (const inv of p.invoices) {
      const sent = inv.sentAt ? ` · sent ${fmtDate(inv.sentAt)}` : ''
      const paid = inv.paidAt ? ` · paid ${fmtDate(inv.paidAt)}` : ''
      lines.push(`  • ${fmtDate(inv.serviceDate)} — ${fmtType(inv.serviceType)} — $${Number(inv.amount).toFixed(2)} [${inv.status}]${sent}${paid}`)
    }
  }

  lines.push('')
  lines.push(`Generated ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} CT`)

  return lines.join('\n')
}

export function CopyContextButton(props: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildText(props))
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy customer context to clipboard for use with Claude"
      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {state === 'copied' ? (
        <>✓ Copied</>
      ) : state === 'error' ? (
        <>⚠ Failed</>
      ) : (
        <>📋 Copy context</>
      )}
    </button>
  )
}
