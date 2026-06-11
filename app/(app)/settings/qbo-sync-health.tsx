'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { pushCustomerToQbo, bulkPushCustomersToQbo } from '@/app/(app)/customers/[id]/update-customer-action'
import { syncInvoiceToQbo } from '@/app/(app)/invoices/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnsyncedCustomer {
  id: string
  name: string
  email: string | null
}

export interface StaleInvoice {
  id: string
  customerName: string
  serviceDate: string
  amount: string
  status: string
}

// ─── Per-customer sync button ─────────────────────────────────────────────────

function CustomerSyncButton({ customerId }: { customerId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return <span className="text-xs text-green-600 font-medium">Synced ✓</span>
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await pushCustomerToQbo(customerId)
            if (!result.ok) {
              setError(result.error)
              toast.error(result.error)
            } else {
              setDone(true)
              toast.success('Customer synced to QBO')
            }
          })
        }}
      >
        {isPending ? 'Syncing…' : 'Sync to QBO'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

// ─── Per-invoice sync button ──────────────────────────────────────────────────

function InvoiceSyncButton({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return <span className="text-xs text-green-600 font-medium">Synced ✓</span>
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await syncInvoiceToQbo(invoiceId)
            if (!result.ok) {
              setError(result.error)
              toast.error(result.error)
            } else {
              setDone(true)
              toast.success('Invoice synced to QBO')
            }
          })
        }}
      >
        {isPending ? 'Syncing…' : 'Sync'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface QboSyncHealthProps {
  unsyncedCustomers: UnsyncedCustomer[]
  staleInvoices: StaleInvoice[]
}

export function QboSyncHealth({ unsyncedCustomers, staleInvoices }: QboSyncHealthProps) {
  const [bulkPending, startBulkTransition] = useTransition()
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)
  const [bulkErrors, setBulkErrors] = useState<string[]>([])
  const [bulkDone, setBulkDone] = useState(false)

  const handleSyncAll = () => {
    setBulkErrors([])
    setBulkDone(false)
    setBulkProgress({ current: 0, total: unsyncedCustomers.length })
    startBulkTransition(async () => {
      const result = await bulkPushCustomersToQbo(unsyncedCustomers.map((c) => c.id))
      setBulkProgress(null)
      setBulkErrors(result.errors)
      setBulkDone(true)
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} customer sync${result.errors.length === 1 ? '' : 's'} failed`)
      } else {
        toast.success('All customers synced to QBO')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>QBO sync health</CardTitle>
        <CardDescription>
          Customers and invoices that need to be pushed to QuickBooks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Unsynced customers ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Unsynced customers</p>
            {unsyncedCustomers.length > 0 && (
              <div className="flex items-center gap-2">
                {bulkProgress && (
                  <span className="text-xs text-muted-foreground">
                    Syncing {bulkProgress.current}/{bulkProgress.total}…
                  </span>
                )}
                {bulkDone && bulkErrors.length === 0 && (
                  <span className="text-xs text-green-600 font-medium">All synced ✓</span>
                )}
                <Button
                  size="sm"
                  disabled={bulkPending}
                  onClick={handleSyncAll}
                >
                  {bulkPending ? 'Syncing…' : 'Sync all'}
                </Button>
              </div>
            )}
          </div>

          {unsyncedCustomers.length === 0 ? (
            <p className="text-xs text-green-600 font-medium">All customers synced ✓</p>
          ) : (
            <div className="border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-sm divide-y">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {unsyncedCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-3 py-2">{customer.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{customer.email ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <CustomerSyncButton customerId={customer.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {bulkErrors.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {bulkErrors.map((err, i) => (
                <li key={i} className="text-xs text-destructive">{err}</li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Invoices needing re-sync ── */}
        <div>
          <p className="text-sm font-medium mb-2">Invoices needing re-sync</p>

          {staleInvoices.length === 0 ? (
            <p className="text-xs text-green-600 font-medium">All invoices up to date ✓</p>
          ) : (
            <div className="border rounded-lg overflow-hidden bg-card">
              <table className="w-full text-sm divide-y">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Service date</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Amount</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {staleInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-3 py-2">{invoice.customerName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{invoice.serviceDate}</td>
                      <td className="px-3 py-2">${Number(invoice.amount).toFixed(2)}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{invoice.status}</td>
                      <td className="px-3 py-2 text-right">
                        <InvoiceSyncButton invoiceId={invoice.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  )
}
