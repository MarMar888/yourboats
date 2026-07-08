'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { services, invoices, customers, customerReminderContacts } from '@/lib/db/schema'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { voidQboInvoice } from '@/lib/qbo/void-invoice'
import { voidInvoiceForService } from '@/lib/invoices/void-invoice'
import { refreshServicePayroll } from '@/lib/pay/payroll-projection'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { getPostHogClient } from '@/lib/posthog-server'
import { emailTransport } from '@/lib/email/client'
import { serviceReminderEmail, formatServiceType } from '@/lib/email/templates/service-reminder'

function uuidOrNull(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

export async function rescheduleService(serviceId: string, newDate: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return { error: 'Not authorized' }

  const [service] = await db
    .select({ id: services.id, status: services.status })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service) return { error: 'Service not found' }
  if (service.status === 'complete') return { error: 'Cannot reschedule a completed service' }

  await db.update(services).set({ serviceDate: newDate }).where(eq(services.id, serviceId))
  await db.update(invoices).set({ qboNeedsSync: true }).where(eq(invoices.serviceId, serviceId))
  await refreshServicePayroll(serviceId, 'service_rescheduled')
  await log({ action: 'reschedule_service', entityType: 'service', entityId: serviceId, metadata: { newDate } })

  const posthog = getPostHogClient()
  posthog.capture({ distinctId: user.id, event: 'service_rescheduled', properties: { service_id: serviceId, new_date: newDate } })
  await posthog.shutdown()

  revalidatePath('/schedule')
  return {}
}

export async function markComplete(serviceId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const [service] = await db
    .select({
      id: services.id,
      status: services.status,
      invoiceId: services.invoiceId,
      totalPrice: services.totalPrice,
      isPrepaid: customers.isPrepaid,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service) return { error: 'Service not found' }
  if (service.status !== 'scheduled') return { error: 'Service is not scheduled' }

  // Condition the update on status still being 'scheduled' so concurrent
  // completions (e.g. a double-tap) can't both pass the check above and then
  // both create an invoice below — only the request that actually flips the
  // row proceeds.
  const [updated] = await db
    .update(services)
    .set({ status: 'complete', completedAt: new Date(), completedByUserId: uuidOrNull(user.id) })
    .where(and(eq(services.id, serviceId), eq(services.status, 'scheduled')))
    .returning({ id: services.id })

  if (!updated) return { error: 'Service is not scheduled' }

  // Prepaid customers never get invoices
  if (!service.invoiceId && !service.isPrepaid) {
    const total = Number(service.totalPrice ?? 0)
    const [invoice] = await db
      .insert(invoices)
      .values({
        serviceId: service.id,
        amount: String(total),
        status: 'draft',
        createdByUserId: user.id,
      })
      .returning()
    await db.update(services).set({ invoiceId: invoice.id }).where(eq(services.id, serviceId))
  }

  await log({ action: 'mark_complete', entityType: 'service', entityId: serviceId })
  await refreshServicePayroll(serviceId, 'service_completed')

  const posthog = getPostHogClient()
  posthog.capture({ distinctId: user.id, event: 'service_completed', properties: { service_id: serviceId, total_price: service.totalPrice, is_prepaid: service.isPrepaid } })
  await posthog.shutdown()

  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  revalidatePath('/invoices')
  return {}
}

export async function markIncomplete(serviceId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }
  if (user.role !== 'owner' && user.role !== 'manager') return { error: 'Not authorized' }

  const [service] = await db
    .select({ id: services.id, status: services.status })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)

  if (!service) return { error: 'Service not found' }
  if (service.status !== 'complete') return { error: 'Service is not complete' }

  await db
    .update(services)
    .set({ status: 'scheduled', completedAt: null, completedByUserId: null })
    .where(eq(services.id, serviceId))

  await refreshServicePayroll(serviceId, 'service_marked_incomplete')
  await log({ action: 'mark_incomplete', entityType: 'service', entityId: serviceId })

  const posthog = getPostHogClient()
  posthog.capture({ distinctId: user.id, event: 'service_marked_incomplete', properties: { service_id: serviceId } })
  await posthog.shutdown()

  revalidatePath('/dashboard')
  revalidatePath('/schedule')
  revalidatePath(`/schedule/${serviceId}`)
  return {}
}

export async function deleteService(serviceId: string, redirectTo?: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    throw new Error('Not authorized')
  }

  const [linkedInvoice] = await db
    .select({ id: invoices.id, qboInvoiceId: invoices.qboInvoiceId })
    .from(invoices)
    .where(eq(invoices.serviceId, serviceId))
    .limit(1)

  if (linkedInvoice?.qboInvoiceId) {
    await voidQboInvoice(linkedInvoice.qboInvoiceId)
  }

  await db.delete(services).where(eq(services.id, serviceId))
  await log({ action: 'delete_service', entityType: 'service', entityId: serviceId })

  const posthogDelete = getPostHogClient()
  const deleteUser = await getCurrentUser()
  if (deleteUser) {
    posthogDelete.capture({ distinctId: deleteUser.id, event: 'service_deleted', properties: { service_id: serviceId } })
  }
  await posthogDelete.shutdown()

  revalidatePath('/schedule')
  revalidatePath('/invoices')
  if (redirectTo) redirect(redirectTo)
}

export async function approveWeek(startDate: string, endDate: string): Promise<void> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) return

  await db
    .update(services)
    .set({ approvedAt: new Date(), approvedByUserId: currentUser.id })
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'scheduled')
      )
    )

  await log({ action: 'approve_week', entityType: 'week', entityId: startDate, metadata: { startDate, endDate } })

  const posthog = getPostHogClient()
  posthog.capture({ distinctId: currentUser.id, event: 'week_approved', properties: { start_date: startDate, end_date: endDate } })
  await posthog.shutdown()

  revalidatePath('/schedule')
}

export async function unapproveWeek(startDate: string, endDate: string): Promise<void> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) return

  await db
    .update(services)
    .set({ approvedAt: null, approvedByUserId: null })
    .where(
      and(
        gte(services.serviceDate, startDate),
        lte(services.serviceDate, endDate),
        eq(services.status, 'scheduled')
      )
    )

  await log({ action: 'unapprove_week', entityType: 'week', entityId: startDate, metadata: { startDate, endDate } })
  revalidatePath('/schedule')
}

/**
 * Immediately send reminder emails for the given service IDs.
 * Used when approving a week after the cron-scheduled send time has passed.
 */
export async function sendRemindersNow(serviceIds: string[]): Promise<{ sent: number; errors: string[] }> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) return { sent: 0, errors: ['Not authorized'] }
  if (serviceIds.length === 0) return { sent: 0, errors: [] }

  // Fetch services + customer info
  const svcRows = await db
    .select({
      id:          services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      customerId:  customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(inArray(services.id, serviceIds))

  // Fetch boat nicknames for each service
  const { serviceBoats, boats } = await import('@/lib/db/schema')
  const boatRows = await db
    .select({ serviceId: serviceBoats.serviceId, nickname: boats.nickname })
    .from(serviceBoats)
    .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
    .where(inArray(serviceBoats.serviceId, serviceIds))

  const boatsByService: Record<string, string[]> = {}
  for (const b of boatRows) {
    ;(boatsByService[b.serviceId] ??= []).push(b.nickname)
  }

  // Fetch reminder contacts
  const customerIds = Array.from(new Set(svcRows.map((s) => s.customerId)))
  const contacts = await db
    .select({ customerId: customerReminderContacts.customerId, email: customerReminderContacts.email })
    .from(customerReminderContacts)
    .where(inArray(customerReminderContacts.customerId, customerIds))

  const contactsByCustomer: Record<string, string[]> = {}
  for (const c of contacts) {
    ;(contactsByCustomer[c.customerId] ??= []).push(c.email)
  }

  let sent = 0
  const errors: string[] = []

  for (const svc of svcRows) {
    const to = contactsByCustomer[svc.customerId] ?? []
    if (to.length === 0) continue

    const [year, month, day] = svc.serviceDate.split('-').map(Number)
    const d = new Date(Date.UTC(year, month - 1, day))
    const serviceDate = d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
    })

    const { subject, text, html } = serviceReminderEmail({
      customerName: svc.customerName,
      serviceDate,
      boats: boatsByService[svc.id] ?? [],
      serviceType: formatServiceType(svc.serviceType),
      businessPhone: svc.customerPhone ?? undefined,
    })

    try {
      await emailTransport.sendMail({
        from: `"Squeaky Clean Boats" <${process.env.GMAIL_USER}>`,
        to: to.join(', '),
        subject,
        text,
        html,
      })
      await db
        .update(services)
        .set({ reminderSentAt: new Date() })
        .where(eq(services.id, svc.id))
      sent++
    } catch (err) {
      errors.push(`${svc.customerName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await log({
    action: 'send_reminders_now',
    entityType: 'week',
    entityId: serviceIds[0],
    metadata: { serviceIds, sent, errors: errors.length },
  })

  revalidatePath('/schedule')
  return { sent, errors }
}

// TODO: Amount-change sync
// When serviceBoats.rate or serviceBoats.rateType is updated after a QBO invoice
// has already been created for the parent service, the QBO invoice becomes stale.
// This action (or a dedicated updateServiceBoat action) should:
//   1. Detect that invoices.qboInvoiceId is set for the service
//   2. Rebuild the Line[] array from the updated serviceBoats rows
//   3. Call qbo.updateInvoice({ Id, SyncToken, sparse: true, Line: [...] }) to
//      push the new amounts to QBO
//   4. Update invoices.amount and invoices.lastSyncedAt locally

// TODO: Invoice status sync (paid/overdue)
// QBO is the source of truth for payment status. A nightly Vercel Cron job should:
//   - Call qbo.findInvoices([{ field: 'Status', value: 'Paid' }]) (paginated)
//   - For each paid QBO invoice, update the local invoices row:
//       status = 'paid', paidAt = QBO TxnDate or current time, lastSyncedAt = now
//   - Additionally query for overdue invoices (DueDate < today, Balance > 0)
//     and set status = 'overdue' locally
