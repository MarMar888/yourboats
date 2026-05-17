'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { customers, boats } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'

export async function updateCustomerNotes(customerId: string, notes: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    throw new Error('Unauthorized')
  }

  await db
    .update(customers)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(eq(customers.id, customerId))

  await log({ action: 'update_customer_notes', entityType: 'customer', entityId: customerId })
  revalidatePath(`/customers/${customerId}`)
}

export async function updateBoatNotes(boatId: string, customerId: string, notes: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    throw new Error('Unauthorized')
  }

  await db
    .update(boats)
    .set({ notes: notes.trim() || null })
    .where(eq(boats.id, boatId))

  await log({ action: 'update_boat_notes', entityType: 'boat', entityId: boatId })
  revalidatePath(`/customers/${customerId}`)
}
