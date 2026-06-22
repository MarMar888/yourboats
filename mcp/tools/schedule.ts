// Schedule tools: read the schedule and run service-lifecycle mutations
// (complete, reschedule, cancel, approve). Mirrors the logic in
// app/(app)/schedule/actions.ts but without Next.js cache/redirect calls.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  services,
  customers,
  invoices,
  serviceBoats,
  boats,
  complaints,
} from '../../lib/db/schema'
import { refreshServicePayroll } from '../../lib/pay/payroll-projection'
import { voidInvoiceForService } from '../../lib/invoices/void-invoice'
import { getOwnerId } from '../owner'
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
    .where(sql`${serviceBoats.serviceId} = ANY(${serviceIds})`)
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
      const ownerId = await getOwnerId()
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
      if (!service) return { ok: false, error: 'Service not found.' }
      if (service.status !== 'scheduled') return { ok: false, error: `Service is ${service.status}, not scheduled.` }

      await db
        .update(services)
        .set({ status: 'complete', completedAt: new Date(), completedByUserId: uuidOrNull(ownerId) })
        .where(eq(services.id, serviceId))

      let invoiceId = service.invoiceId
      if (!service.invoiceId && !service.isPrepaid) {
        const total = Number(service.totalPrice ?? 0)
        const [invoice] = await db
          .insert(invoices)
          .values({ serviceId: service.id, amount: String(total), status: 'draft', createdByUserId: ownerId })
          .returning()
        await db.update(services).set({ invoiceId: invoice.id }).where(eq(services.id, serviceId))
        invoiceId = invoice.id
      }

      await refreshServicePayroll(serviceId, 'service_completed')
      await mcpLog({ userId: ownerId, action: 'mark_complete', entityType: 'service', entityId: serviceId })
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
      const ownerId = await getOwnerId()
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
      await mcpLog({ userId: ownerId, action: 'mark_incomplete', entityType: 'service', entityId: serviceId })
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
      const ownerId = await getOwnerId()
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
      await mcpLog({ userId: ownerId, action: 'reschedule_service', entityType: 'service', entityId: serviceId, metadata: { newDate } })
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
      const ownerId = await getOwnerId()
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
      await mcpLog({ userId: ownerId, action: 'cancel_service', entityType: 'service', entityId: serviceId })
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
      const ownerId = await getOwnerId()
      const updated = await db
        .update(services)
        .set({ approvedAt: new Date(), approvedByUserId: ownerId })
        .where(and(gte(services.serviceDate, startDate), lte(services.serviceDate, endDate), eq(services.status, 'scheduled')))
        .returning({ id: services.id })
      await mcpLog({ userId: ownerId, action: 'approve_week', entityType: 'week', entityId: startDate, metadata: { startDate, endDate, count: updated.length } })
      return { ok: true, approvedCount: updated.length, startDate, endDate }
    }
  )
}
