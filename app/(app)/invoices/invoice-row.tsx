'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EditInvoiceForm } from './edit-invoice-form'
import { InvoiceActionsButton } from './invoice-actions-button'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { deleteInvoice } from './actions'

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
  docNumber: number | null
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
  qboItemOptions,
}: {
  inv: InvoiceRowData
  qboItemOptions: { qboItemId: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <td className="px-4 py-3 font-medium">{inv.customerName}</td>
        <td className="px-4 py-3 text-muted-foreground">{fmtDate(inv.serviceDate)}</td>
        <td className="px-4 py-3 text-right tabular-nums font-semibold">
          ${Number(inv.amount).toFixed(2)}
        </td>
        {inv.status === 'draft' ? (
          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-1">
              <InvoiceActionsButton
                invoiceId={inv.invoiceId}
                hasQboId={!!inv.qboInvoiceId}
                status={inv.status}
                qboItems={qboItemOptions}
              />
              {inv.canManage && (
                <ConfirmDeleteButton
                  action={deleteInvoice.bind(null, inv.invoiceId)}
                  title="Delete invoice"
                  description={`Delete the draft invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                />
              )}
            </div>
          </td>
        ) : (
          <>
            <td className="px-4 py-3">
              <span className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                statusClass(inv.status as InvoiceStatus)
              )}>
                {inv.status}
              </span>
            </td>
            <td className="px-4 py-3 font-mono text-xs">
              {inv.qboInvoiceId ? (
                <a
                  href={qboInvoiceUrl(inv.qboInvoiceId, inv.qboEnv)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {inv.docNumber ? `#${inv.docNumber}` : `QBO ${inv.qboInvoiceId}`}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
              {inv.canManage && (
                <ConfirmDeleteButton
                  action={deleteInvoice.bind(null, inv.invoiceId)}
                  title="Delete invoice"
                  description={`Delete the ${inv.status} invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                />
              )}
            </td>
          </>
        )}
      </tr>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice — {inv.customerName}</DialogTitle>
          </DialogHeader>

          {editing ? (
            <div className="px-6 py-4">
              <EditInvoiceForm
                invoiceId={inv.invoiceId}
                initialAmount={inv.amount}
                initialNotes={inv.notes}
                initialStatus={inv.status}
                onClose={() => { setEditing(false); setOpen(false) }}
              />
            </div>
          ) : (
            <div className="space-y-4 px-6 py-4">
              {/* Status + Amount */}
              <div className="flex items-center gap-4 mb-1">
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
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</dt>
                  <dd className="mt-1 font-medium">{inv.customerName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service date</dt>
                  <dd className="mt-1">{fmtDate(inv.serviceDate)}</dd>
                </div>
                {inv.sentAt && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sent</dt>
                    <dd className="mt-1">{fmtDateTime(inv.sentAt)}</dd>
                  </div>
                )}
                {inv.paidAt && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paid</dt>
                    <dd className="mt-1">{fmtDateTime(inv.paidAt)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice ID</dt>
                  <dd className="mt-1 font-mono text-xs">{inv.invoiceId}</dd>
                </div>
                {inv.docNumber && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoice #</dt>
                    <dd className="mt-1 font-mono text-xs font-semibold">#{inv.docNumber}</dd>
                  </div>
                )}
                {inv.qboInvoiceId && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">QBO ID</dt>
                    <dd className="mt-1 font-mono text-xs text-muted-foreground">{inv.qboInvoiceId}</dd>
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
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
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
                    className="text-sm text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View in QBO ↗
                  </a>
                )}

                {inv.canManage && (
                  <div className="ml-auto flex items-center gap-2">
                    <ConfirmDeleteButton
                      action={async () => { await deleteInvoice(inv.invoiceId); setOpen(false) }}
                      title="Delete invoice"
                      description={`Delete the ${inv.status} invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
