'use server'

import { randomInt } from 'node:crypto'
import { redirect } from 'next/navigation'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, customerReminderContacts, clientOtpCodes } from '@/lib/db/schema'
import { emailTransport } from '@/lib/email/client'
import { setClientSession } from '@/lib/auth/client-session'
import { hashOtp } from '@/lib/auth/hash-otp'
import { logSystem } from '@/lib/log'

const OTP_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const GENERIC_MESSAGE = 'If that email is on file, we sent a 6-digit code. Check your inbox.'

async function findCustomerByEmail(email: string): Promise<{ id: string; name: string } | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const [direct] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(sql`lower(${customers.email}) = ${normalized}`)
    .limit(1)
  if (direct) return direct

  const [viaContact] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customerReminderContacts)
    .innerJoin(customers, eq(customerReminderContacts.customerId, customers.id))
    .where(sql`lower(${customerReminderContacts.email}) = ${normalized}`)
    .limit(1)
  return viaContact ?? null
}

// Always returns the same message regardless of whether the email matched a
// customer, so this endpoint can't be used to enumerate who's a customer.
export async function requestClientOtp(email: string): Promise<{ message: string }> {
  const customer = await findCustomerByEmail(email)

  if (customer) {
    const code = String(randomInt(100000, 1000000))
    await db.insert(clientOtpCodes).values({
      customerId: customer.id,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    })

    try {
      await emailTransport.sendMail({
        from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
        to: email.trim(),
        subject: `Your Squeaky Clean Boats code: ${code}`,
        text: `Hi ${customer.name}, your one-time code is ${code}. It expires in 10 minutes.`,
        html: `<p>Hi ${customer.name},</p><p>Your one-time code is <strong style="font-size:20px;">${code}</strong>. It expires in 10 minutes.</p>`,
      })
      await logSystem({ action: 'client_otp_requested', entityType: 'customer', entityId: customer.id })
    } catch (err) {
      await logSystem({
        action: 'client_otp_send_failed',
        entityType: 'customer',
        entityId: customer.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { message: GENERIC_MESSAGE }
}

export async function verifyClientOtp(email: string, code: string): Promise<{ error?: string }> {
  const customer = await findCustomerByEmail(email)
  if (!customer) return { error: 'Incorrect code.' }

  const [latest] = await db
    .select()
    .from(clientOtpCodes)
    .where(
      and(
        eq(clientOtpCodes.customerId, customer.id),
        isNull(clientOtpCodes.consumedAt),
        gt(clientOtpCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(clientOtpCodes.createdAt))
    .limit(1)

  if (!latest) return { error: 'That code expired. Request a new one.' }
  if (latest.attempts >= MAX_ATTEMPTS) return { error: 'Too many attempts. Request a new code.' }

  if (hashOtp(code.trim()) !== latest.codeHash) {
    await db
      .update(clientOtpCodes)
      .set({ attempts: latest.attempts + 1 })
      .where(eq(clientOtpCodes.id, latest.id))
    return { error: 'Incorrect code.' }
  }

  await db.update(clientOtpCodes).set({ consumedAt: new Date() }).where(eq(clientOtpCodes.id, latest.id))
  await setClientSession(customer.id)
  await logSystem({ action: 'client_login', entityType: 'customer', entityId: customer.id })

  redirect('/client')
}
