'use server'

import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getQboClient } from '@/lib/qbo/client'
import { log } from '@/lib/log'

export async function updateCustomer(customerId: string, formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim() || null
  const phone = (formData.get('phone') as string)?.trim() || null
  const address = (formData.get('address') as string)?.trim() || null
  const notes = (formData.get('notes') as string)?.trim() || null
  const isPrepaid = formData.get('isPrepaid') === 'on'

  if (!name) throw new Error('Name is required.')

  const [updated] = await db
    .update(customers)
    .set({ name, email, phone, address, notes, isPrepaid, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning()

  await log({
    action: 'update_customer',
    entityType: 'customer',
    entityId: customerId,
    metadata: { name },
  })

  // Sync billing fields to QBO if connected
  if (updated?.qboCustomerId) {
    try {
      const qbo = await getQboClient()

      // Fetch current SyncToken from QBO (required for sparse updates)
      const existing = await new Promise<{ Id: string; SyncToken: string }>(
        (resolve, reject) =>
          qbo.getCustomer(
            updated.qboCustomerId!,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err: unknown, result: any) =>
              err || !result ? reject(err) : resolve(result)
          )
      )

      await new Promise<void>((resolve, reject) =>
        qbo.updateCustomer(
          {
            Id: existing.Id,
            SyncToken: existing.SyncToken,
            DisplayName: name,
            PrimaryEmailAddr: email ? { Address: email } : undefined,
            PrimaryPhone: phone ? { FreeFormNumber: phone } : undefined,
            BillAddr: address ? { Line1: address } : undefined,
            sparse: true,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err: unknown, _result: any) => (err ? reject(err) : resolve())
        )
      )

      await db
        .update(customers)
        .set({ lastSyncedAt: new Date() })
        .where(eq(customers.id, customerId))

      await log({
        action: 'update_customer_qbo',
        entityType: 'customer',
        entityId: customerId,
        metadata: { qboId: updated.qboCustomerId },
      })
    } catch (err) {
      await log({
        action: 'update_customer_qbo',
        entityType: 'customer',
        entityId: customerId,
        error: String(err),
      })
      // Don't surface QBO errors to user — local save succeeded
    }
  }

  redirect(`/customers/${customerId}`)
}
