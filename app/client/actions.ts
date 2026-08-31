'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { services, serviceRequests, boats } from '@/lib/db/schema'
import { getClientSession, clearClientSession } from '@/lib/auth/client-session'
import { logSystem } from '@/lib/log'

async function requireClientSession() {
  const session = await getClientSession()
  if (!session) redirect('/login')
  return session
}

export async function clientLogout() {
  await clearClientSession()
  redirect('/login')
}

type ActionResult = { ok: true } | { ok: false; error: string }

export async function submitServiceRequest(input: {
  serviceId?: string
  type: 'reschedule' | 'cancel' | 'note'
  requestedDate?: string
  message?: string
}): Promise<ActionResult> {
  const session = await requireClientSession()

  // Reschedule/cancel always target a specific service; a note can be
  // general (e.g. from the dashboard) with no serviceId at all.
  if (input.serviceId) {
    const [service] = await db
      .select({ id: services.id, status: services.status })
      .from(services)
      .where(and(eq(services.id, input.serviceId), eq(services.customerId, session.customerId)))
      .limit(1)
    if (!service) return { ok: false, error: 'Service not found.' }
    if (service.status !== 'scheduled') return { ok: false, error: 'That service is no longer scheduled.' }
  } else if (input.type !== 'note') {
    return { ok: false, error: 'A service is required for that request.' }
  }

  if (input.type === 'reschedule' && !input.requestedDate) {
    return { ok: false, error: 'Pick a date first.' }
  }
  if (input.type === 'note' && !input.message?.trim()) {
    return { ok: false, error: 'Add a note first.' }
  }

  await db.insert(serviceRequests).values({
    customerId: session.customerId,
    serviceId: input.serviceId ?? null,
    type: input.type,
    requestedDate: input.requestedDate || null,
    message: input.message?.trim() || null,
  })

  await logSystem({
    action: 'client_service_request',
    entityType: input.serviceId ? 'service' : 'customer',
    entityId: input.serviceId ?? session.customerId,
    metadata: { type: input.type },
  })

  revalidatePath('/client')
  revalidatePath('/client/requests')
  if (input.serviceId) revalidatePath(`/client/service/${input.serviceId}`)

  return { ok: true }
}

export async function submitNewServiceRequest(input: {
  serviceType: string
  boatId?: string
  requestedDate?: string
  message?: string
}): Promise<ActionResult> {
  const session = await requireClientSession()
  if (!input.serviceType.trim()) return { ok: false, error: 'Pick a service type.' }

  let boatNote = ''
  if (input.boatId) {
    const [boat] = await db
      .select({ nickname: boats.nickname })
      .from(boats)
      .where(and(eq(boats.id, input.boatId), eq(boats.customerId, session.customerId)))
      .limit(1)
    if (!boat) return { ok: false, error: 'Boat not found.' }
    boatNote = `Boat: ${boat.nickname}. `
  }

  await db.insert(serviceRequests).values({
    customerId: session.customerId,
    type: 'new_service',
    serviceType: input.serviceType.trim(),
    requestedDate: input.requestedDate || null,
    message: (boatNote + (input.message?.trim() ?? '')).trim() || null,
  })

  await logSystem({
    action: 'client_service_request',
    entityType: 'customer',
    entityId: session.customerId,
    metadata: { type: 'new_service' },
  })

  revalidatePath('/client')
  revalidatePath('/client/requests')
  redirect('/client/requests')
}
