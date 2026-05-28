'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { services, invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { refreshServicePayroll } from '@/lib/pay/payroll-projection'

function isTipLine(line: Record<string, unknown>): boolean {
  const desc = ((line.Description as string) ?? '').toLowerCase()
  const itemName = ((line.SalesItemLineDetail as Record<string, unknown>)?.ItemRef as Record<string, unknown>)?.name
  const name = (typeof itemName === 'string' ? itemName : '').toLowerCase()
  return desc.includes('tip') || desc.includes('gratuity') || name.includes('tip') || name.includes('gratuity')
}

export async function syncTipFromQbo(serviceId: string): Promise<{ error?: string; tipAmount?: number }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { error: 'Unauthorized' }
  }

  const [invoice] = await db
    .select({ qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.serviceId, serviceId))
    .limit(1)

  if (!invoice?.qboInvoiceId) {
    return { error: 'No QBO invoice linked to this service' }
  }

  let qboInvoice: Record<string, unknown>
  try {
    const qbo = await getQboClient()
    qboInvoice = await new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qbo.getInvoice(invoice.qboInvoiceId!, (err: unknown, result: any) =>
        err ? reject(err) : resolve(result)
      )
    })
  } catch {
    return { error: 'Failed to fetch invoice from QuickBooks' }
  }

  const lines = (qboInvoice.Line as Record<string, unknown>[]) ?? []
  const tipTotal = lines
    .filter(isTipLine)
    .reduce((sum, line) => sum + (Number(line.Amount) || 0), 0)

  await db
    .update(services)
    .set({ tipAmount: tipTotal > 0 ? String(tipTotal) : null })
    .where(eq(services.id, serviceId))

  await refreshServicePayroll(serviceId, 'qbo_tip_synced')
  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/pay')
  return { tipAmount: tipTotal }
}
