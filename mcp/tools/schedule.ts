// Schedule tools: read the schedule and run service-lifecycle mutations
// (complete, reschedule, cancel, approve). Mirrors the logic in
// app/(app)/schedule/actions.ts but without Next.js cache/redirect calls.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../db'
import {
  services,
  customers,
  invoices,
  serviceBoats,
  boats,
  complaints,
  recurringSchedules,
} from '../../lib/db/schema'
import { refreshServicePayroll } from '../../lib/pay/payroll-projection'
import { voidInvoiceForService } from '../../lib/invoices/void-invoice'
import { getActorId } from '../actor'
import { mcpLog } from '../log'
import { tool, YMD } from './_util'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function uuidOrNull(value: string): string | null {
  return UUID_RE.test(value) ? value : null
}

// Returns the boat nicknames attached to each of the given service IDs.
async function boatsByService(serviceIds: string[]): Promise<Record<string, string[]>> {
  if (serviceIds.length === 0) return {}
  const rows = await db
    .select({ serviceId: serviceBoats.serviceId, nickname: boats.nickname })
    .from(serviceBoats)
    .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
    .where(inArray(serviceBoats.serviceId, serviceIds))
  const out: Record<string, string[]> = {}
  for (const r of rows) (out[r.serviceId] ??= []).push(r.nickname)
  return out
}

export function registerScheduleTools(server: McpServer): void {
  tool(
    server,
    'list_services',
    'List boat-cleaning services, optionally filtered by date range and status. Returns each service with customer name, date, type, status, price, and attached boats. Ordered by service date.',
    {
      startDate: z.string().regex(YMD).optional().describe('Earliest service date (YYYY-MM-DD), inclusive'),
      endDate: z.string().regex(YMD).optional().describe('Latest service date (YYYY-MM-DD), inclusive'),
      status: z.enum(['scheduled', 'complete', 'cancelled']).optional().describe('Filter by service status'),
      limit: z.number().int().min(1).max(500).optional().describe('Max rows to return (default 100)'),
    },
    async ({ startDate, endDate, status, limit }) => {
      const conds = []
      if (startDate) conds.push(gte(services.serviceDate, startDate))
      if (endDate) conds.push(lte(services.serviceDate, endDate))
      if (status) conds.push(eq(services.status, status))

      const rows = await db
        .select({
          id: services.id,
          serviceDate: services.serviceDate,
          serviceType: services.serviceType,
          status: services.status,
          totalPrice: services.totalPrice,
          tipAmount: services.tipAmount,
          approvedAt: services.approvedAt,
          completedAt: services.completedAt,
          customerId: customers.id,
          customerName: customers.name,
          isPrepaid: customers.isPrepaid,
        })
        .from(services)
        .innerJoin(customers, eq(services.customerId, customers.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(services.serviceDate)
        .limit(limit ?? 100)

      const boatMap = await boatsByService(rows.map((r) => r.id))
      return {
        ok: true,
        count: rows.length,
        services: rows.map((r) => ({ ...r, boats: boatMap[r.id] ?? [] })),
      }
    }
  )

  tool(
    server,
    'get_service',
    'Get full detail for a single service by ID: customer, boats with rates, tip, status, and linked invoice status.',
    {
      serviceId: z.string().uuid().describe('Service UUID'),
    },
    async ({ serviceId }) => {
      const [svc] = await db
        .select({
          id: services.id,
          serviceDate: services.serviceDate,
          serviceType: services.serviceType,
          status: services.status,
          notes: services.notes,
          totalPrice: services.totalPrice,
          tipAmount: services.tipAmount,
          approvedAt: services.approvedAt,
          completedAt: services.completedAt,
          reminderSentAt: services.reminderSentAt,
          recurringScheduleId: services.recurringScheduleId,
          customerId: customers.id,
          customerName: customers.name,
          customerEmail: customers.email,
          isPrepaid: customers.isPrepaid,
        })
        .from(services)
        .innerJoin(customers, eq(services.customerId, customers.id))
        .where(eq(services.id, serviceId))
        .limit(1)
      if (!svc) return { ok: false, error: 'Service not found.' }

      const boatRows = await db
        .select({
          boatId: serviceBoats.boatId,
          nickname: boats.nickname,
          lengthFt: boats.lengthFt,
          description: serviceBoats.description,
          rateType: serviceBoats.rateType,
          rate: serviceBoats.rate,
        })
        .from(serviceBoats)
        .leftJoin(boats, eq(serviceBoats.boatId, boats.id))
        .where(eq(serviceBoats.serviceId, serviceId))

      const [invoice] = await db
        .select({
          id: invoices.id,
          status: invoices.status,
          amount: invoices.amount,
          qboInvoiceId: invoices.qboInvoiceId,
          qboPaymentLink: invoices.qboPaymentLink,
          docNumber: invoices.docNumber,
        })
        .from(invoices)
        .where(eq(invoices.serviceId, serviceId))
        .limit(1)

      const openComplaints = await db
        .select({ id: complaints.id, severity: complaints.severity, description: complaints.description, resolved: complaints.resolved })
        .from(complaints)
        .where(eq(complaints.serviceId, serviceId))

      return { ok: true, service: svc, boats: boatRows, invoice: invoice ?? null, complaints: openComplaints }
    }
  )

  tool(
    server,
    'mark_complete',
    'Mark a scheduled service as complete. Records completion time and, for non-prepaid customers without an existing invoice, creates a draft invoice. Refreshes payroll.',
    {
      serviceId: z.string().uuid().describe('Service UUID to mark complete'),
    },
    async ({ serviceId }) => {
      const actorId = getActorId()
      const [service] = await db
        .select({
          id: services.id,
          status: services.status,
          invoiceId: services.invoiceId,
          totalPrice: services.totalPrice,
          isPrepaid: customers.isPrepaid,
          schedulePrepaid: recurringSchedules.prepaid,
        })
        .from(services)
        .innerJoin(customers, eq(services.customerId, customers.id))
        .leftJoin(recurringSchedules, eq(services.recurringScheduleId, recurringSchedules.id))
        .where(eq(services.id, serviceId))
        .limit(1)
      if (!service) return { ok: false, error: 'Service not found.' }
      if (service.status !== 'scheduled') return { ok: false, error: `Service is ${service.status}, not scheduled.` }

      await db
        .update(services)
        .set({ status: 'complete', completedAt: new Date(), completedByUserId: uuidOrNull(actorId) })
        .where(eq(services.id, serviceId))

      // Skip invoicing when the customer OR the originating recurring schedule is prepaid.
      const isPrepaid = service.isPrepaid || service.schedulePrepaid === true
      let invoiceId = service.invoiceId
      if (!service.invoiceId && !isPrepaid) {
        const total = Number(service.totalPrice ?? 0)
        const [invoice] = await db
          .insert(invoices)
          .values({ serviceId: service.id, amount: String(total), status: 'draft', createdByUserId: actorId })
          .returning()
        await db.update(services).set({ invoiceId: invoice.id }).where(eq(services.id, serviceId))
        invoiceId = invoice.id
      }

      await refreshServicePayroll(serviceId, 'service_completed')
      await mcpLog({ userId: actorId, action: 'mark_complete', entityType: 'service', entityId: serviceId })
      return { ok: true, serviceId, invoiceId, invoiceCreated: invoiceId !== service.invoiceId }
    }
  )

  tool(
    server,
    'mark_incomplete',
    'Revert a completed service back to scheduled. Clears completion data and refreshes payroll.',
    {
      serviceId: z.string().uuid().describe('Service UUID to revert to scheduled'),
    },
    async ({ serviceId }) => {
      const actorId = getActorId()
      const [service] = await db
        .select({ id: services.id, status: services.status })
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1)
      if (!service) return { ok: false, error: 'Service not found.' }
      if (service.status !== 'complete') return { ok: false, error: 'Service is not complete.' }

      await db
        .update(services)
        .set({ status: 'scheduled', completedAt: null, completedByUserId: null })
        .where(eq(services.id, serviceId))
      await refreshServicePayroll(serviceId, 'service_marked_incomplete')
      await mcpLog({ userId: actorId, action: 'mark_incomplete', entityType: 'service', entityId: serviceId })
      return { ok: true, serviceId }
    }
  )

  tool(
    server,
    'reschedule_service',
    'Move a scheduled service to a new date. Flags the linked QBO invoice for re-sync and refreshes payroll. Cannot reschedule a completed service.',
    {
      serviceId: z.string().uuid().describe('Service UUID to move'),
      newDate: z.string().regex(YMD).describe('New service date (YYYY-MM-DD)'),
    },
    async ({ serviceId, newDate }) => {
      const actorId = getActorId()
      const [service] = await db
        .select({ id: services.id, status: services.status })
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1)
      if (!service) return { ok: false, error: 'Service not found.' }
      if (service.status === 'complete') return { ok: false, error: 'Cannot reschedule a completed service.' }

      await db.update(services).set({ serviceDate: newDate }).where(eq(services.id, serviceId))
      await db.update(invoices).set({ qboNeedsSync: true }).where(eq(invoices.serviceId, serviceId))
      await refreshServicePayroll(serviceId, 'service_rescheduled')
      await mcpLog({ userId: actorId, action: 'reschedule_service', entityType: 'service', entityId: serviceId, metadata: { newDate } })
      return { ok: true, serviceId, newDate }
    }
  )

  tool(
    server,
    'cancel_service',
    'Cancel a scheduled service. Voids any linked invoice (also in QBO) and refreshes payroll.',
    {
      serviceId: z.string().uuid().describe('Service UUID to cancel'),
    },
    async ({ serviceId }) => {
      const actorId = getActorId()
      const [service] = await db
        .select({ id: services.id, status: services.status })
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1)
      if (!service) return { ok: false, error: 'Service not found.' }
      if (service.status === 'cancelled') return { ok: true, serviceId, alreadyCancelled: true }

      const voidResult = await voidInvoiceForService(serviceId)
      if (!voidResult.ok) return { ok: false, error: voidResult.error }

      await db.update(services).set({ status: 'cancelled' }).where(eq(services.id, serviceId))
      await refreshServicePayroll(serviceId, 'service_cancelled')
      await mcpLog({ userId: actorId, action: 'cancel_service', entityType: 'service', entityId: serviceId })
      return { ok: true, serviceId }
    }
  )

  tool(
    server,
    'approve_week',
    'Approve all scheduled services in a date range, making them eligible for customer reminder emails and invoicing.',
    {
      startDate: z.string().regex(YMD).describe('Range start (YYYY-MM-DD), inclusive'),
      endDate: z.string().regex(YMD).describe('Range end (YYYY-MM-DD), inclusive'),
    },
    async ({ startDate, endDate }) => {
      const actorId = getActorId()
      const updated = await db
        .update(services)
        .set({ approvedAt: new Date(), approvedByUserId: actorId })
        .where(and(gte(services.serviceDate, startDate), lte(services.serviceDate, endDate), eq(services.status, 'scheduled')))
        .returning({ id: services.id })
      await mcpLog({ userId: actorId, action: 'approve_week', entityType: 'week', entityId: startDate, metadata: { startDate, endDate, count: updated.length } })
      return { ok: true, approvedCount: updated.length, startDate, endDate }
    }
  )

  tool(
    server,
    'update_service',
    'Update an existing service\'s editable fields: service-level notes, service type, total price, and per-boat description/notes. To change the date use reschedule_service; to change status use mark_complete/mark_incomplete/cancel_service.',
    {
      serviceId: z.string().uuid().describe('Service UUID'),
      notes: z.string().nullable().optional().describe('Service-level notes (null to clear)'),
      serviceType: z.string().optional().describe('New service type (should match a QBO item name)'),
      totalPrice: z.number().nonnegative().optional().describe('Override total price; also updates the linked draft invoice amount'),
      boatNotes: z
        .array(
          z.object({
            boatId: z.string().uuid().describe('Boat UUID (must already be on this service)'),
            description: z.string().nullable().optional().describe('Line description, e.g. "Interior, Exterior" (null to clear)'),
            notes: z.string().nullable().optional().describe('Per-boat operational notes (null to clear)'),
          })
        )
        .optional()
        .describe('Per-boat description/notes updates for boats already on this service'),
    },
    async ({ serviceId, notes, serviceType, totalPrice, boatNotes }) => {
      const actorId = getActorId()
      const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1)
      if (!svc) return { ok: false, error: 'Service not found.' }

      if (notes === undefined && serviceType === undefined && totalPrice === undefined && !boatNotes?.length) {
        return { ok: false, error: 'No fields to update.' }
      }

      const patch: Record<string, unknown> = {}
      if (notes !== undefined) patch.notes = notes
      if (serviceType !== undefined) patch.serviceType = serviceType
      if (totalPrice !== undefined) patch.totalPrice = String(totalPrice)
      if (Object.keys(patch).length > 0) await db.update(services).set(patch).where(eq(services.id, serviceId))

      // Keep the linked invoice in step with a manual price override.
      if (totalPrice !== undefined) {
        await db.update(invoices).set({ amount: String(totalPrice), qboNeedsSync: true }).where(eq(invoices.serviceId, serviceId))
      }

      // Update per-boat description/notes for boats already on the service.
      const updatedBoats: string[] = []
      const missingBoats: string[] = []
      for (const b of boatNotes ?? []) {
        const bp: Record<string, unknown> = {}
        if (b.description !== undefined) bp.description = b.description
        if (b.notes !== undefined) bp.notes = b.notes
        if (Object.keys(bp).length === 0) continue
        const res = await db
          .update(serviceBoats)
          .set(bp)
          .where(and(eq(serviceBoats.serviceId, serviceId), eq(serviceBoats.boatId, b.boatId)))
          .returning({ boatId: serviceBoats.boatId })
        if (res.length > 0) updatedBoats.push(b.boatId)
        else missingBoats.push(b.boatId)
      }

      // Service type or price change affects pay math — refresh unapproved payroll.
      if (serviceType !== undefined || totalPrice !== undefined) {
        await refreshServicePayroll(serviceId, 'service_updated')
      }

      await mcpLog({ userId: actorId, action: 'update_service', entityType: 'service', entityId: serviceId, metadata: { fields: Object.keys(patch), boatNotes: updatedBoats.length } })
      return {
        ok: true,
        serviceId,
        updatedFields: Object.keys(patch),
        ...(updatedBoats.length ? { updatedBoats } : {}),
        ...(missingBoats.length ? { boatsNotOnService: missingBoats } : {}),
      }
    }
  )
}
