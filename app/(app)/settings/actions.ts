'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { emailTransport } from '@/lib/email/client'
import { log } from '@/lib/log'

const TEST_ADDRESS = '19523731631.19525295203.jtBf327Pgh@txt.voice.google.com'

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
