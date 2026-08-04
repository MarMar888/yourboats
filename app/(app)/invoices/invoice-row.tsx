'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EditInvoiceForm } from './edit-invoice-form'
import { InvoiceActionsButton } from './invoice-actions-button'
import { SendReminderButton } from './send-reminder-button'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { deleteInvoice, voidInvoice, markInvoicePaid } from './actions'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(ymd: string) {
  const [, m, d] = ymd.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${d}`
}

function fmtDateTime(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
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
  isPrepaid: boolean
  canManage: boolean
  qboEnv?: string
  lineItems: {
    serviceId: string
    boatId: string
    nickname: string
    lengthFt: number | null
    description: string | null
    rateType: 'per_ft' | 'flat' | null
    rate: string | null
  }[]
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
        <td className="px-4 py-3 font-medium">
          <Link
            href={`/customers/${inv.customerId}`}
            className="hover:text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {inv.customerName}
          </Link>
        </td>
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
                isPrepaid={inv.isPrepaid}
                qboItems={qboItemOptions}
              />
              {inv.canManage && (
                <div className="flex items-center gap-1">
                  <ConfirmDeleteButton
                    action={voidInvoice.bind(null, inv.invoiceId)}
                    title="Void invoice"
                    description={`Void the invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)}) while keeping the service record?`}
                    triggerLabel="Void"
                    confirmLabel="Void"
                    pendingLabel="Voiding…"
                  />
                  <ConfirmDeleteButton
                    action={deleteInvoice.bind(null, inv.invoiceId)}
                    title="Delete invoice"
                    description={`Delete the draft invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                  />
                </div>
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
                <div className="flex items-center justify-end gap-1">
                  {(inv.status === 'sent' || inv.status === 'overdue') && (
                    <>
                      <SendReminderButton invoiceId={inv.invoiceId} />
                      <ConfirmDeleteButton
                        action={markInvoicePaid.bind(null, inv.invoiceId)}
                        tone="default"
                        title="Mark invoice paid"
                        description={`Record a payment of $${Number(inv.amount).toFixed(2)} for ${inv.customerName} in QuickBooks (deposited to Undeposited Funds). Use this for payments received outside QuickBooks — cash, check, Venmo, etc.`}
                        triggerLabel="Mark paid"
                        confirmLabel="Mark paid"
                        pendingLabel="Recording…"
                      />
                    </>
                  )}
                  {inv.status !== 'void' && inv.status !== 'paid' && (
                    <ConfirmDeleteButton
                      action={voidInvoice.bind(null, inv.invoiceId)}
                      title="Void invoice"
                      description={`Void the invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)}) while keeping the service record?`}
                      triggerLabel="Void"
                      confirmLabel="Void"
                      pendingLabel="Voiding…"
                    />
                  )}
                  <ConfirmDeleteButton
                    action={deleteInvoice.bind(null, inv.invoiceId)}
                    title="Delete invoice"
                    description={`Delete the ${inv.status} invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                  />
                </div>
              )}
            </td>
          </>
        )}
      </tr>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(false) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice — {inv.customerName}</DialogTitle>
          </DialogHeader>

          {editing ? (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <EditInvoiceForm
                invoiceId={inv.invoiceId}
                initialNotes={inv.notes}
                initialStatus={inv.status}
                initialDocNumber={inv.docNumber}
                lineItems={inv.lineItems}
                onClose={() => { setEditing(false); setOpen(false) }}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 px-6 py-4">
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
                  <dd className="mt-1 font-medium">
                    <Link href={`/customers/${inv.customerId}`} className="hover:text-primary hover:underline">
                      {inv.customerName}
                    </Link>
                  </dd>
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

              {inv.lineItems.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {inv.lineItems.map((line) => {
                        const rateType = line.rateType ?? 'per_ft'
                        const rate = Number(line.rate ?? 0)
                        const qty = rateType === 'per_ft' ? (line.lengthFt ?? 0) : 1
                        const amount = rate * qty
                        return (
                          <tr key={line.boatId}>
                            <td className="px-3 py-2">
                              <div className="font-medium">{line.nickname}</div>
                              {line.description && (
                                <div className="text-xs text-muted-foreground">{line.description}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {rateType === 'per_ft' ? `${line.lengthFt ?? 0} ft x $${rate.toFixed(2)}` : 'Flat'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">${amount.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
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
                    {(inv.status === 'sent' || inv.status === 'overdue') && (
                      <>
                        <SendReminderButton invoiceId={inv.invoiceId} />
                        <ConfirmDeleteButton
                          action={async () => { await markInvoicePaid(inv.invoiceId) }}
                          tone="default"
                          title="Mark invoice paid"
                          description={`Record a payment of $${Number(inv.amount).toFixed(2)} for ${inv.customerName} in QuickBooks (deposited to Undeposited Funds). Use this for payments received outside QuickBooks — cash, check, Venmo, etc.`}
                          triggerLabel="Mark paid"
                          confirmLabel="Mark paid"
                          pendingLabel="Recording…"
                        />
                      </>
                    )}
                    {inv.status !== 'void' && inv.status !== 'paid' && (
                      <ConfirmDeleteButton
                        action={async () => { await voidInvoice(inv.invoiceId); setOpen(false) }}
                        title="Void invoice"
                        description={`Void the invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)}) while keeping the service record?`}
                        triggerLabel="Void"
                        confirmLabel="Void"
                        pendingLabel="Voiding…"
                      />
                    )}
                    <ConfirmDeleteButton
                      action={async () => { await deleteInvoice(inv.invoiceId); setOpen(false) }}
                      title="Delete invoice"
                      description={`Delete the ${inv.status} invoice for ${inv.customerName} (${fmtDate(inv.serviceDate)})? This cannot be undone.`}
                    />
                    {inv.status !== 'paid' && inv.status !== 'void' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                      >
                        Edit
                      </Button>
                    )}
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
