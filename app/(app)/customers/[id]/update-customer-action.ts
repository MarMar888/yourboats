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

// ─── Push unsynced customer to QBO ───────────────────────────────────────────

export async function pushCustomerToQbo(customerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { ok: false, error: 'Not authorized' }
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (!customer) return { ok: false, error: 'Customer not found.' }
  if (customer.qboCustomerId) return { ok: false, error: 'Already synced to QBO.' }

  try {
    const qbo = await getQboClient()
    const qboCustomer = await new Promise<{ Id: string }>((resolve, reject) =>
      qbo.createCustomer(
        {
          DisplayName: customer.name,
          PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
          PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
          BillAddr: customer.address ? { Line1: customer.address } : undefined,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: unknown, result: any) => (err || !result ? reject(err ?? new Error('No result')) : resolve(result))
      )
    )

    await db
      .update(customers)
      .set({ qboCustomerId: qboCustomer.Id, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(customers.id, customerId))

    await log({ action: 'push_customer_qbo', entityType: 'customer', entityId: customerId, metadata: { qboId: qboCustomer.Id } })
    revalidatePath(`/customers/${customerId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Bulk push unsynced customers to QBO ─────────────────────────────────────

export async function bulkPushCustomersToQbo(
  customerIds: string[]
): Promise<{ synced: number; errors: string[] }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    return { synced: 0, errors: ['Not authorized'] }
  }

  let synced = 0
  const errors: string[] = []

  for (const customerId of customerIds) {
    const result = await pushCustomerToQbo(customerId)
    if (result.ok) {
      synced++
    } else {
      errors.push(result.error)
    }
  }

  revalidatePath('/settings')
  return { synced, errors }
}
