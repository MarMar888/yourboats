'use server'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { getQboClient } from '@/lib/qbo/client'

export async function updateCustomer(customerId: string, data: {
  name: string
  phone: string | null
  email: string | null
  address: string | null
}) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { error: 'Not authorized' }
  }

  await db.update(customers).set({
    ...data,
    updatedAt: new Date(),
  }).where(eq(customers.id, customerId))

  // Sync to QBO if linked
  const [customer] = await db
    .select({ qboCustomerId: customers.qboCustomerId })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (customer?.qboCustomerId) {
    try {
      const qbo = await getQboClient()
      const existing = await new Promise<{ Id: string; SyncToken: string }>(
        (resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          qbo.getCustomer(customer.qboCustomerId!, (err: unknown, result: any) =>
            err ? reject(err) : resolve(result)
          )
        }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {
        Id: existing.Id,
        SyncToken: existing.SyncToken,
        sparse: true,
        DisplayName: data.name,
      }
      if (data.email !== undefined) {
        patch.PrimaryEmailAddr = data.email ? { Address: data.email } : null
      }
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qbo.updateCustomer(patch, (err: unknown, _result: any) =>
          err ? reject(err) : resolve()
        )
      })
      await db
        .update(customers)
        .set({ lastSyncedAt: new Date() })
        .where(eq(customers.id, customerId))
    } catch (err) {
      console.error('[QBO] Failed to sync customer update', customerId, err)
    }
  }

  await log({ action: 'update_customer', entityType: 'customer', entityId: customerId, metadata: { name: data.name } })
  revalidatePath(`/customers/${customerId}`)
  revalidatePath('/customers')
  return {}
}
