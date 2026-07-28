'use server'

import { db } from '@/lib/db'
import { customers, boats } from '@/lib/db/schema'
import { getQboClient } from '@/lib/qbo/client'
import { extractQboErrorMessage } from '@/lib/qbo/errors'
import { eq } from 'drizzle-orm'
import { log } from '@/lib/log'
import { getCurrentUser } from '@/lib/auth/get-current-user'

async function requireManager() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    throw new Error('Unauthorized')
  }
  return user
}

// ─── Create customer ──────────────────────────────────────────────────────────

export type CreateCustomerResult =
  | { ok: true; customer: typeof customers.$inferSelect }
  | { ok: false; error: string }

export async function createCustomer(formData: FormData): Promise<CreateCustomerResult> {
  await requireManager()
  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim() || null
  const phone = (formData.get('phone') as string)?.trim() || null
  const address = (formData.get('address') as string)?.trim() || null
  const notes = (formData.get('notes') as string)?.trim() || null
  const isPrepaid = formData.get('isPrepaid') === 'on'

  if (!name) return { ok: false, error: 'Name is required.' }

  const [customer] = await db
    .insert(customers)
    .values({ name, email, phone, address, notes, isPrepaid })
    .returning()

  await log({ action: 'create_customer', entityType: 'customer', entityId: customer.id, metadata: { name } })

  // Push to QBO if connected
  try {
    const qbo = await getQboClient()
    const qboCustomer = await new Promise<{ Id: string }>((resolve, reject) =>
      qbo.createCustomer(
        {
          DisplayName: name,
          PrimaryEmailAddr: email ? { Address: email } : undefined,
          PrimaryPhone: phone ? { FreeFormNumber: phone } : undefined,
          BillAddr: address ? { Line1: address } : undefined,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: unknown, result: any) => (err || !result ? reject(err) : resolve(result))
      )
    )

    await db
      .update(customers)
      .set({ qboCustomerId: qboCustomer.Id, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(customers.id, customer.id))

    customer.qboCustomerId = qboCustomer.Id
    await log({ action: 'push_customer_qbo', entityType: 'customer', entityId: customer.id, metadata: { qboId: qboCustomer.Id } })
  } catch (err) {
    await log({ action: 'push_customer_qbo', entityType: 'customer', entityId: customer.id, error: extractQboErrorMessage(err) })
  }

  return { ok: true, customer }
}

// ─── Get customers (for modal dropdowns) ─────────────────────────────────────

export async function getCustomers() {
  return db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(customers.name)
}

// ─── Create boat ──────────────────────────────────────────────────────────────

export type CreateBoatResult =
  | { ok: true; boat: typeof boats.$inferSelect }
  | { ok: false; error: string }

export async function createBoat(formData: FormData): Promise<CreateBoatResult> {
  await requireManager()
  const customerId = (formData.get('customerId') as string)?.trim()
  const nickname = (formData.get('nickname') as string)?.trim()
  const makeModel = (formData.get('makeModel') as string)?.trim() || null
  const lengthFtRaw = formData.get('lengthFt') as string
  const lengthFt = lengthFtRaw ? Math.round(Number(lengthFtRaw)) : null
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!customerId) return { ok: false, error: 'Customer is required.' }
  if (!nickname) return { ok: false, error: 'Boat name is required.' }

  const [boat] = await db
    .insert(boats)
    .values({ customerId, nickname, makeModel, lengthFt, notes })
    .returning()

  await log({ action: 'create_boat', entityType: 'boat', entityId: boat.id, metadata: { nickname, customerId } })

  return { ok: true, boat }
}
