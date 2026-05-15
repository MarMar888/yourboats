'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getQboClient } from '@/lib/qbo/client'

interface UpdateCustomerInput {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  notes?: string | null
  isPrepaid?: boolean
}

export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput
): Promise<void> {
  // 1. Update locally first
  await db
    .update(customers)
    .set({
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      ...(input.isPrepaid !== undefined ? { isPrepaid: input.isPrepaid } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))

  // 2. Sync name/email to QBO if this customer has a QBO link
  const [customer] = await db
    .select({ qboCustomerId: customers.qboCustomerId })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)

  if (customer?.qboCustomerId) {
    try {
      const qbo = await getQboClient()

      // Fetch current SyncToken — required before any QBO update
      const existing = await new Promise<{ Id: string; SyncToken: string }>(
        (resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          qbo.getCustomer(customer.qboCustomerId!, (err: unknown, result: any) =>
            err ? reject(err) : resolve(result)
          )
        }
      )

      // Sparse update: only send the fields we changed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {
        Id: existing.Id,
        SyncToken: existing.SyncToken,
        sparse: true,
        DisplayName: input.name,
      }

      if (input.email !== undefined) {
        patch.PrimaryEmailAddr = input.email ? { Address: input.email } : null
      }

      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qbo.updateCustomer(patch, (err: unknown, _result: any) =>
          err ? reject(err) : resolve()
        )
      })

      // Record sync time
      await db
        .update(customers)
        .set({ lastSyncedAt: new Date() })
        .where(eq(customers.id, customerId))
    } catch (err) {
      // QBO errors are non-fatal — local update already succeeded
      console.error('[QBO] Failed to sync customer update', customerId, err)
    }
  }

  revalidatePath(`/customers/${customerId}`)
  revalidatePath('/customers')
}
