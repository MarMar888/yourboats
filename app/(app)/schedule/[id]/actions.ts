'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { complaints, serviceBoatAssignments, services, serviceBoats, invoices, boats } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { getPostHogClient } from '@/lib/posthog-server'
import { syncPayrollPriceForService } from '@/lib/pay/sync-payroll-price'

// ─── Update service ───────────────────────────────────────────────────────────

export async function updateService(
  serviceId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    return { ok: false, error: 'Not authorized' }
  }

  const serviceDate = formData.get('serviceDate') as string
  const serviceType = formData.get('serviceType') as string
  const notes = (formData.get('notes') as string) || null
  const totalPrice = (formData.get('totalPrice') as string) || null
  const status = formData.get('status') as string

  const [currentService] = await db
    .select({ serviceDate: services.serviceDate, totalPrice: services.totalPrice })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)

  await db
    .update(services)
    .set({
      serviceDate,
      serviceType: serviceType as never,
      notes,
      totalPrice: totalPrice ? String(Number(totalPrice)) : null,
      status: status as never,
    })
    .where(eq(services.id, serviceId))

  // If the service date changed, flag the linked QBO invoice for re-sync
  // so TxnDate and DueDate stay accurate in QuickBooks.
  if (currentService && currentService.serviceDate !== serviceDate) {
    await db
      .update(invoices)
      .set({ qboNeedsSync: true })
      .where(eq(invoices.serviceId, serviceId))
  }

  // If totalPrice was manually set and changed, keep invoice.amount in sync
  // and propagate the new price to any saved payroll records.
  if (totalPrice) {
    const newPrice = Number(totalPrice)
    const oldPrice = currentService ? Number(currentService.totalPrice ?? 0) : undefined
    if (oldPrice === undefined || Math.abs(newPrice - oldPrice) > 0.005) {
      await db
        .update(invoices)
        .set({ amount: String(newPrice), qboNeedsSync: true })
        .where(eq(invoices.serviceId, serviceId))
      await syncPayrollPriceForService(serviceId, serviceType, newPrice)
    }
  }

  // Update boat rows and assignments
  const boatIds = formData.getAll('boatIds') as string[]

  // Fetch existing service boats to know which to delete
  const existingBoats = await db
    .select({ boatId: serviceBoats.boatId })
    .from(serviceBoats)
    .where(eq(serviceBoats.serviceId, serviceId))
  const existingBoatIds = existingBoats.map((b) => b.boatId)

  // Delete boats removed from service
  const removedBoatIds = existingBoatIds.filter((id) => !boatIds.includes(id))
  if (removedBoatIds.length > 0) {
    await db
      .delete(serviceBoats)
      .where(
        and(
          eq(serviceBoats.serviceId, serviceId),
          inArray(serviceBoats.boatId, removedBoatIds)
        )
      )
  }

  // Fetch boat lengths for total price recalculation
  const boatRecords = boatIds.length
    ? await db.select({ id: boats.id, lengthFt: boats.lengthFt }).from(boats).where(inArray(boats.id, boatIds))
    : []
  const boatLengths: Record<string, number | null> = Object.fromEntries(
    boatRecords.map((b) => [b.id, b.lengthFt])
  )

  // Upsert each selected boat
  for (const boatId of boatIds) {
    const description = (formData.get(`boat_desc_${boatId}`) as string) || null
    const boatNotes = (formData.get(`boat_notes_${boatId}`) as string) || null
    const rateType = (formData.get(`boat_rateType_${boatId}`) as 'per_ft' | 'flat') ?? 'per_ft'
    const rate = (formData.get(`boat_rate_${boatId}`) as string) || null
    const assignedUserIds = formData.getAll(`boat_employees_${boatId}`) as string[]

    await db
      .insert(serviceBoats)
      .values({ serviceId, boatId, description, notes: boatNotes, rateType, rate })
      .onConflictDoUpdate({
        target: [serviceBoats.serviceId, serviceBoats.boatId],
        set: { description, notes: boatNotes, rateType, rate },
      })

    // Replace assignments for this boat
    await db
      .delete(serviceBoatAssignments)
      .where(and(eq(serviceBoatAssignments.serviceId, serviceId), eq(serviceBoatAssignments.boatId, boatId)))
    if (assignedUserIds.length > 0) {
      await db.insert(serviceBoatAssignments).values(
        assignedUserIds.map((userId) => ({ serviceId, boatId, userId }))
      )
    }
  }

  // Recompute total from boat rows if not manually set
  if (!totalPrice && boatIds.length > 0) {
    let computed = 0
    for (const boatId of boatIds) {
      const rateType = (formData.get(`boat_rateType_${boatId}`) as string) ?? 'per_ft'
      const rate = Number(formData.get(`boat_rate_${boatId}`) ?? 0)
      const qty = rateType === 'per_ft' ? (boatLengths[boatId] ?? 0) : 1
      computed += rate * qty
    }
    if (computed > 0) {
      await db.update(services).set({ totalPrice: String(computed) }).where(eq(services.id, serviceId))
      // Also update draft invoice amount
      await db
        .update(invoices)
        .set({ amount: String(computed) })
        .where(and(eq(invoices.serviceId, serviceId)))
      await syncPayrollPriceForService(serviceId, serviceType, computed)
    }
  }

  await log({ action: 'update_service', entityType: 'service', entityId: serviceId, metadata: { serviceDate, serviceType, status } })
  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/schedule')
  return { ok: true }
}

// ─── Generate invoice from completed service ──────────────────────────────────

export async function generateInvoiceFromService(
  serviceId: string
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    return { ok: false, error: 'Not authorized' }
  }

  // Check no invoice already exists
  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.serviceId, serviceId))
    .limit(1)
  if (existing.length > 0) return { ok: false, error: 'Invoice already exists for this service.' }

  const [svc] = await db
    .select({ totalPrice: services.totalPrice, status: services.status })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1)
  if (!svc) return { ok: false, error: 'Service not found.' }
  if (svc.status !== 'complete') return { ok: false, error: 'Service is not complete.' }

  const amount = svc.totalPrice ?? '0'

  const [invoice] = await db
    .insert(invoices)
    .values({ serviceId, amount, status: 'draft' })
    .returning()

  await db.update(services).set({ invoiceId: invoice.id }).where(eq(services.id, serviceId))
  await log({ action: 'generate_invoice', entityType: 'service', entityId: serviceId, metadata: { invoiceId: invoice.id } })

  const posthog = getPostHogClient()
  posthog.capture({ distinctId: currentUser.id, event: 'invoice_generated', properties: { service_id: serviceId, invoice_id: invoice.id, amount: amount } })
  await posthog.shutdown()

  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/invoices')
  return { ok: true, invoiceId: invoice.id }
}

export async function flagComplaint(
  serviceId: string,
  customerId: string,
  description: string,
  severity: 'minor' | 'major'
) {
  const currentUser = await getCurrentUser()

  if (!currentUser) throw new Error('Not authenticated')
  if (!description.trim()) throw new Error('Description is required')

  await db.insert(complaints).values({
    serviceId,
    customerId,
    description: description.trim(),
    severity,
    resolved: false,
    createdByUserId: currentUser.id,
  })

  await log({ action: 'flag_complaint', entityType: 'service', entityId: serviceId, metadata: { customerId, severity } })

  const posthog = getPostHogClient()
  posthog.capture({ distinctId: currentUser.id, event: 'complaint_flagged', properties: { service_id: serviceId, customer_id: customerId, severity } })
  await posthog.shutdown()

  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/complaints')
}

export async function updateBoatAssignments(
  serviceId: string,
  boatId: string,
  userIds: string[]
): Promise<void> {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) return

  await db
    .delete(serviceBoatAssignments)
    .where(
      and(
        eq(serviceBoatAssignments.serviceId, serviceId),
        eq(serviceBoatAssignments.boatId, boatId)
      )
    )

  if (userIds.length > 0) {
    await db.insert(serviceBoatAssignments).values(
      userIds.map((userId) => ({ serviceId, boatId, userId }))
    )
  }

  await log({ action: 'update_boat_assignment', entityType: 'service', entityId: serviceId, metadata: { boatId, userIds } })
  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/schedule')
}
