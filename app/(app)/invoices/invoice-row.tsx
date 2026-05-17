'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EditInvoiceForm } from './edit-invoice-form'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(ymd: string) {
  const [, m, d] = ymd.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${d}`
}

function fmtDateTime(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

function statusClass(status: InvoiceStatus) {
  switch (status) {
    case 'draft':   return 'border-border bg-muted text-muted-foreground'
    case 'sent':    return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'paid':    return 'border-green-200 bg-green-50 text-green-700'
    case 'overdue': return 'border-red-200 bg-red-50 text-red-700'
    case 'void':    return 'border-border bg-muted text-muted-foreground'
  }
}

function qboInvoiceUrl(qboInvoiceId: string, env?: string) {
  const base = env === 'production'
    ? 'https://app.qbo.intuit.com'
    : 'https://sandbox.qbo.intuit.com'
  return `${base}/app/invoice?txnId=${qboInvoiceId}`
}

export type InvoiceRowData = {
  invoiceId: string
  qboInvoiceId: string | null
  amount: string
  notes: string | null
  status: string
  sentAt: Date | null
  paidAt: Date | null
  serviceDate: string
  serviceStatus: string
  serviceId: string
  customerName: string
  customerId: string
  canManage: boolean
  qboEnv?: string
}

export function InvoiceRow({
  inv,
  children,
}: {
  inv: InvoiceRowData
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setOpen(true)}
      >
        {children}
      </tr>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice — {inv.customerName}</DialogTitle>
          </DialogHeader>

          {editing ? (
            <EditInvoiceForm
              invoiceId={inv.invoiceId}
              initialAmount={inv.amount}
              initialNotes={inv.notes}
              initialStatus={inv.status}
              onClose={() => { setEditing(false); setOpen(false) }}
            />
          ) : (
            <div className="space-y-4">
              {/* Status + Amount */}
              <div className="flex items-center gap-3">
                <span className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  statusClass(inv.status as InvoiceStatus)
                )}>
                  {inv.status}
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  ${Number(inv.amount).toFixed(2)}
                </span>
              </div>

              {/* Details */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</dt>
                  <dd className="mt-0.5 font-medium">{inv.customerName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service date</dt>
                  <dd className="mt-0.5">{fmtDate(inv.serviceDate)}</dd>
                </div>
                {inv.sentAt && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sent</dt>
                    <dd className="mt-0.5">{fmtDateTime(inv.sentAt)}</dd>
                  </div>
                )}
                {inv.paidAt && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paid</dt>
                    <dd className="mt-0.5">{fmtDateTime(inv.paidAt)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice ID</dt>
                  <dd className="mt-0.5 font-mono text-xs">{inv.invoiceId}</dd>
                </div>
                {inv.qboInvoiceId && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">QBO Invoice</dt>
                    <dd className="mt-0.5 font-mono text-xs">#{inv.qboInvoiceId}</dd>
                  </div>
                )}
              </dl>

              {inv.notes && (
                <div className="rounded-md bg-muted/50 border px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{inv.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                <a
                  href={`/schedule/${inv.serviceId}`}
                  className="text-sm text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View service →
                </a>

                {inv.qboInvoiceId && (
                  <a
                    href={qboInvoiceUrl(inv.qboInvoiceId, inv.qboEnv)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline ml-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View in QBO ↗
                  </a>
                )}

                {inv.canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
