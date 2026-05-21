import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { inArray, isNotNull } from 'drizzle-orm'
import { getQboClient } from './client'

/**
 * Pull current payment status from QBO for all sent/overdue invoices.
 * Called on the invoices page load — updates local DB before page renders.
 * Silently no-ops if QBO is not connected or returns an error.
 */
export async function syncInvoiceStatuses(): Promise<void> {
  // Only sync invoices that could have changed: sent or overdue
  const candidates = await db
    .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId, status: invoices.status })
    .from(invoices)
    .where(inArray(invoices.status, ['sent', 'overdue']))

  const withQbo = candidates.filter((r) => r.qboInvoiceId != null)
  if (withQbo.length === 0) return

  try {
    const qbo = await getQboClient()
    const ids = withQbo.map((r) => r.qboInvoiceId!)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new Promise<{ QueryResponse: { Invoice?: any[] } }>((resolve, reject) =>
      qbo.findInvoices(
        { Id: ids },
        (err: unknown, data: any) => (err ? reject(err) : resolve(data))
      )
    )

    const qboInvoices: { Id: string; Balance: number; DueDate?: string; DocNumber?: string }[] =
      result?.QueryResponse?.Invoice ?? []

    const today = new Date().toISOString().split('T')[0]

    for (const qboInv of qboInvoices) {
      const local = withQbo.find((r) => r.qboInvoiceId === qboInv.Id)
      if (!local) continue

      const isPaid = Number(qboInv.Balance) === 0
      const isOverdue = !isPaid && qboInv.DueDate != null && qboInv.DueDate < today

      const newStatus = isPaid ? 'paid' : isOverdue ? 'overdue' : 'sent'
      if (newStatus === local.status) continue

      await db
        .update(invoices)
        .set({
          status: newStatus as 'paid' | 'overdue' | 'sent',
          ...(isPaid ? { paidAt: new Date() } : {}),
          ...(qboInv.DocNumber ? { docNumber: parseInt(qboInv.DocNumber, 10) } : {}),
          lastSyncedAt: new Date(),
        })
        .where(inArray(invoices.id, [local.id]))
    }
  } catch {
    // QBO unavailable or token expired — show stale data rather than break the page
  }
}
