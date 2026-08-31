import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { getQboClient } from '@/lib/qbo/client'
import { extractQboErrorMessage } from '@/lib/qbo/errors'

export type OpenInvoice = {
  qboInvoiceId: string
  docNumber?: string
  txnDate?: string
  dueDate?: string
  balance: number
  paymentLink: string | null
}

type QboOpenInvoice = {
  Id: string
  DocNumber?: string
  TxnDate?: string
  DueDate?: string
  Balance: number
}

// Live QBO balance (Balance > 0), joined against the payment link we already
// cached locally when the invoice was created/synced. QBO is the source of
// truth for what's actually owed; we never trust a locally-stored balance.
export async function getOpenInvoicesForCustomer(qboCustomerId: string): Promise<OpenInvoice[]> {
  const qbo = await getQboClient()
  const result = await new Promise<{ QueryResponse: { Invoice?: QboOpenInvoice[] } }>((resolve, reject) =>
    qbo.findInvoices(
      [
        { field: 'CustomerRef', value: qboCustomerId },
        { field: 'Balance', value: '0', operator: '>' },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: unknown, data: any) => (err ? reject(new Error(extractQboErrorMessage(err))) : resolve(data))
    )
  )
  const openInvoices = result?.QueryResponse?.Invoice ?? []
  if (openInvoices.length === 0) return []

  const qboIds = openInvoices.map((inv) => inv.Id)
  const localInvoices = await db
    .select({ qboInvoiceId: invoices.qboInvoiceId, qboPaymentLink: invoices.qboPaymentLink })
    .from(invoices)
    .where(inArray(invoices.qboInvoiceId, qboIds))
  const paymentLinkByQboId = new Map(localInvoices.map((inv) => [inv.qboInvoiceId, inv.qboPaymentLink]))

  return openInvoices
    .sort((a, b) => (a.TxnDate ?? '').localeCompare(b.TxnDate ?? ''))
    .map((inv) => ({
      qboInvoiceId: inv.Id,
      docNumber: inv.DocNumber,
      txnDate: inv.TxnDate,
      dueDate: inv.DueDate,
      balance: Number(inv.Balance),
      paymentLink: paymentLinkByQboId.get(inv.Id) ?? null,
    }))
}
