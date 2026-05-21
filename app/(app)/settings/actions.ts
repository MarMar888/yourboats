'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { emailTransport } from '@/lib/email/client'
import { log } from '@/lib/log'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { isNotNull, eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { revalidatePath } from 'next/cache'

const TEST_ADDRESS = '19523731631.19525295203.jtBf327Pgh@txt.voice.google.com'

export async function reconcileDocNumbers(): Promise<{ ok: boolean; updated: number; message?: string }> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') {
    return { ok: false, updated: 0, message: 'Owner only.' }
  }

  // Fetch all local invoices that are in QBO
  const synced = await db
    .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(isNotNull(invoices.qboInvoiceId))

  if (synced.length === 0) return { ok: true, updated: 0 }

  try {
    const qbo = await getQboClient()
    const ids = synced.map((r) => `'${r.qboInvoiceId}'`).join(', ')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new Promise<{ QueryResponse: { Invoice?: any[] } }>((resolve, reject) =>
      qbo.query(
        `SELECT Id, DocNumber FROM Invoice WHERE Id IN (${ids})`,
        (err: unknown, data: any) => (err ? reject(err) : resolve(data))
      )
    )

    const qboInvoices: { Id: string; DocNumber: string }[] = result?.QueryResponse?.Invoice ?? []
    const qboMap = new Map(qboInvoices.map((i) => [i.Id, parseInt(i.DocNumber, 10)]))

    let updated = 0
    for (const row of synced) {
      const docNumber = qboMap.get(row.qboInvoiceId!)
      if (docNumber !== undefined) {
        await db.update(invoices).set({ docNumber }).where(eq(invoices.id, row.id))
        updated++
      }
    }

    await log({ action: 'reconcile_doc_numbers', metadata: { updated } })
    revalidatePath('/invoices')
    revalidatePath('/settings')
    return { ok: true, updated }
  } catch (err) {
    return { ok: false, updated: 0, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function sendInvoiceTest(): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') {
    return { ok: false, message: 'Owner only.' }
  }

  try {
    await emailTransport.sendMail({
      from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
      to: TEST_ADDRESS,
      subject: 'Your invoice from Squeaky Clean Boats',
      text: 'Hi Dan Gladney, your invoice from Squeaky Clean Boats is ready: https://invoice.qbo.intuit.com/invoice/TEST_LINK',
    })
    await log({ action: 'invoice_sms_test_sent', metadata: { to: TEST_ADDRESS } })
    return { ok: true, message: `Sent to ${TEST_ADDRESS}` }
  } catch (err) {
    return { ok: false, message: `Failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
