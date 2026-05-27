import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { max } from 'drizzle-orm'

const MIN_DOC_NUMBER = 1400

/**
 * Returns the next DocNumber to use when creating a QBO invoice.
 *
 * QBO's ORDERBY on DocNumber is lexicographic, not numeric — "999" sorts
 * higher than "1400" in a DESC query. We work around this by fetching the
 * top 200 results and computing the true numeric max in JS.
 *
 * Falls back to the local DB max (or MIN_DOC_NUMBER) if the QBO query fails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getNextQboDocNumber(qbo: any): Promise<string> {
  let highest = MIN_DOC_NUMBER - 1

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new Promise<any>((resolve, reject) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (qbo as any).query(
        'SELECT DocNumber FROM Invoice MAXRESULTS 200',
        (err: unknown, data: any) => (err ? reject(err) : resolve(data))
      )
    )

    const qboInvoices: Array<{ DocNumber?: string }> =
      result?.QueryResponse?.Invoice ?? []

    // Find true numeric max — lexicographic sort from QBO is unreliable
    for (const inv of qboInvoices) {
      const n = parseInt(inv.DocNumber ?? '', 10)
      if (!isNaN(n) && n > highest) highest = n
    }
  } catch {
    // QBO query unavailable — fall back to local DB max
    const [row] = await db.select({ max: max(invoices.docNumber) }).from(invoices)
    if (row?.max) highest = Math.max(highest, row.max)
  }

  return String(highest + 1)
}
