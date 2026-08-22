'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { emailTransport } from '@/lib/email/client'
import { log } from '@/lib/log'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { isNotNull, eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { revalidatePath } from 'next/cache'
import { MARLEY_SMS, NATE_SMS } from '@/lib/constants/sms'

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
    const ids = synced.map((r) => r.qboInvoiceId!)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await new Promise<{ QueryResponse: { Invoice?: any[] } }>((resolve, reject) =>
      qbo.findInvoices(
        { Id: ids },
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
      to: MARLEY_SMS,
      subject: 'Your invoice from Squeaky Clean Boats',
      text: 'Hi Dan Gladney, your invoice from Squeaky Clean Boats is ready: https://invoice.qbo.intuit.com/invoice/TEST_LINK',
    })
    await log({ action: 'invoice_sms_test_sent', metadata: { to: MARLEY_SMS } })
    return { ok: true, message: `Sent to ${MARLEY_SMS}` }
  } catch (err) {
    return { ok: false, message: `Failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function sendScheduleReminderTest(): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') {
    return { ok: false, message: 'Owner only.' }
  }

  try {
    await emailTransport.sendMail({
      from: `"Yourboats" <${process.env.GMAIL_USER}>`,
      to: NATE_SMS,
      subject: 'Schedule approval reminder',
      text: 'Reminder: Please approve this weeks schedule. (https://yourboats.vercel.app/schedule)',
    })
    await log({ action: 'schedule_reminder_test_sent', metadata: { to: NATE_SMS } })
    return { ok: true, message: `Test sent to Nate` }
  } catch (err) {
    return { ok: false, message: `Failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
