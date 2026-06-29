'use server'

import { db } from '@/lib/db'
import { customerReminderContacts } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireManager } from '@/lib/auth/require-role'

export async function addReminderContact(
  customerId: string,
  email: string,
  label: string | null
) {
  await requireManager()
  await db.insert(customerReminderContacts).values({
    customerId,
    email: email.trim(),
    label: label?.trim() || null,
  })
  revalidatePath(`/customers/${customerId}`)
}

export async function deleteReminderContact(contactId: string, customerId: string) {
  await requireManager()
  await db
    .delete(customerReminderContacts)
    .where(eq(customerReminderContacts.id, contactId))
  revalidatePath(`/customers/${customerId}`)
}
