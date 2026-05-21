import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { max } from 'drizzle-orm'

const MIN_DOC_NUMBER = 1400

/**
 * Returns the next DocNumber to use when creating a QBO invoice.
 * Queries QBO for the current highest DocNumber, then ensures we never go
 * below MIN_DOC_NUMBER (1400) — the floor we set when the API integration launched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getNextQboDocNumber(qbo: any): Promise<string> {
  let highest = MIN_DOC_NUMBER - 1

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new Promise<any>((resolve, reject) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (qbo as any).query(
        'SELECT DocNumber FROM Invoice ORDERBY DocNumber DESC MAXRESULTS 1',
        (err: unknown, data: any) => (err ? reject(err) : resolve(data))
      )
    )
    const top: string | undefined = result?.QueryResponse?.Invoice?.[0]?.DocNumber
    if (top) highest = Math.max(highest, parseInt(top, 10))
  } catch {
    // QBO query unavailable — fall back to local DB max
    const [row] = await db.select({ max: max(invoices.docNumber) }).from(invoices)
    if (row?.max) highest = Math.max(highest, row.max)
  }

  return String(highest + 1)
}
