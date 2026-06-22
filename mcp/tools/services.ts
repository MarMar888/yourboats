// Service-creation tools: one-time services, recurring schedules, and tips.
// Mirrors app/(app)/schedule/new/actions.ts (createService) without Next.js calls.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  services,
  serviceBoats,
  serviceBoatAssignments,
  invoices,
  recurringSchedules,
  boats,
  customers,
} from '../../lib/db/schema'
import { refreshServicePayroll } from '../../lib/pay/payroll-projection'
import { getOwnerId } from '../owner'
import { mcpLog } from '../log'
import { tool, YMD } from './_util'

// A boat line on a service: which boat, how it's priced, and who's assigned.
const boatLineSchema = z.object({
  boatId: z.string().uuid().describe('Boat UUID'),
  rateType: z.enum(['per_ft', 'flat']).default('per_ft').describe('per_ft multiplies rate by boat length; flat is a fixed charge'),
  rate: z.number().nonnegative().describe('Dollar rate — per foot (per_ft) or flat amount (flat)'),
  description: z.string().optional().describe('Line description, e.g. "Interior, Exterior"'),
  assignedUserIds: z.array(z.string()).optional().describe('Employee user IDs assigned to this boat'),
})

type BoatLine = z.infer<typeof boatLineSchema>

// Compute the total price for a set of boat lines (per_ft uses boat length).
async function computeTotal(boatLines: BoatLine[]): Promise<{ total: number; lengths: Record<string, number | null> }> {
  const ids = boatLines.map((b) => b.boatId)
  const recs = ids.length
    ? await db.select({ id: boats.id, lengthFt: boats.lengthFt }).from(boats).where(inArray(boats.id, ids))
    : []
  const lengths: Record<string, number | null> = Object.fromEntries(recs.map((b) => [b.id, b.lengthFt]))
  const total = boatLines.reduce((sum, b) => {
    const qty = b.rateType === 'per_ft' ? (lengths[b.boatId] ?? 0) : 1
    return sum + b.rate * qty
  }, 0)
  return { total, lengths }
}

async function insertServiceBoats(serviceId: string, boatLines: BoatLine[]): Promise<void> {
  if (boatLines.length === 0) return
  await db.insert(serviceBoats).values(
    boatLines.map((b) => ({
      serviceId,
      boatId: b.boatId,
      description: b.description ?? null,
      rateType: b.rateType,
      rate: String(b.rate),
    }))
  )
  const assignments = boatLines.flatMap((b) =>
    (b.assignedUserIds ?? []).map((userId) => ({ serviceId, boatId: b.boatId, userId }))
  )
  if (assignments.length > 0) await db.insert(serviceBoatAssignments).values(assignments).onConflictDoNothing()
}

// Every occurrence of dayOfWeek (0=Sun…6=Sat) between start and end at the given
// frequency, as YYYY-MM-DD strings. Matches occurrenceDates in schedule/new/actions.ts.
function occurrenceDates(startDate: string, endDate: string, dayOfWeek: number, frequencyWeeks: number): string[] {
  const dates: string[] = []
  const end = new Date(endDate + 'T00:00:00')
  const cur = new Date(startDate + 'T00:00:00')
  const diff = (dayOfWeek - cur.getDay() + 7) % 7
  cur.setDate(cur.getDate() + diff)
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + frequencyWeeks * 7)
  }
  return dates
}

export function registerServiceTools(server: McpServer): void {
  tool(
    server,
    'create_service',
    'Schedule a new one-time service for a customer on a given date. Computes the total from the boat lines and creates a draft invoice for non-prepaid customers.',
    {
      customerId: z.string().uuid().describe('Customer UUID'),
      serviceDate: z.string().regex(YMD).describe('Service date (YYYY-MM-DD)'),
      serviceType: z.string().describe('Service type — should match a QBO item name, e.g. "Recurring Cleaning"'),
      boats: z.array(boatLineSchema).min(1).describe('One or more boat lines with rates'),
      qboItemId: z.string().optional().describe('Optional QBO item ID for invoice line items'),
      notes: z.string().optional().describe('Optional service notes'),
    },
    async ({ customerId, serviceDate, serviceType, boats: boatLines, qboItemId, notes }) => {
      const ownerId = await getOwnerId()
      const [customer] = await db
        .select({ id: customers.id, isPrepaid: customers.isPrepaid })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1)
      if (!customer) return { ok: false, error: 'Customer not found.' }

      const { total } = await computeTotal(boatLines)
      const [service] = await db
        .insert(services)
        .values({
          customerId,
          serviceDate,
          serviceType,
          qboItemId: qboItemId ?? null,
          status: 'scheduled',
          notes: notes ?? null,
          totalPrice: total > 0 ? String(total) : null,
        })
        .returning()

      await insertServiceBoats(service.id, boatLines)

      let invoiceId: string | null = null
      if (!customer.isPrepaid) {
        const [invoice] = await db
          .insert(invoices)
          .values({ serviceId: service.id, amount: String(total), status: 'draft', createdByUserId: ownerId })
          .returning()
        await db.update(services).set({ invoiceId: invoice.id }).where(eq(services.id, service.id))
        invoiceId = invoice.id
      }

      await mcpLog({ userId: ownerId, action: 'create_service', entityType: 'service', entityId: service.id, metadata: { customerId, serviceDate, serviceType, mode: 'onetime' } })
      return { ok: true, serviceId: service.id, total, invoiceId, isPrepaid: customer.isPrepaid }
    }
  )

  tool(
    server,
    'create_recurring_schedule',
    'Create a recurring service schedule and expand it into individual scheduled services for every occurrence between the start and end dates. No invoices are created up-front; invoices are generated as each service is completed.',
    {
      customerId: z.string().uuid().describe('Customer UUID'),
      serviceType: z.string().describe('Service type — should match a QBO item name'),
      startDate: z.string().regex(YMD).describe('First eligible date (YYYY-MM-DD)'),
      endDate: z.string().regex(YMD).describe('Last eligible date (YYYY-MM-DD)'),
      dayOfWeek: z.number().int().min(0).max(6).describe('Day of week: 0=Sunday … 6=Saturday'),
      frequencyWeeks: z.number().int().min(1).default(1).describe('Repeat every N weeks (1=weekly, 2=biweekly)'),
      boats: z.array(boatLineSchema).min(1).describe('Boat lines applied to every occurrence'),
      qboItemId: z.string().optional().describe('Optional QBO item ID for invoice line items'),
      prepaid: z.boolean().default(false).describe('Mark the schedule prepaid (skips invoicing on completion)'),
    },
    async ({ customerId, serviceType, startDate, endDate, dayOfWeek, frequencyWeeks, boats: boatLines, qboItemId, prepaid }) => {
      const ownerId = await getOwnerId()
      const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1)
      if (!customer) return { ok: false, error: 'Customer not found.' }

      const { total } = await computeTotal(boatLines)
      const [schedule] = await db
        .insert(recurringSchedules)
        .values({
          customerId,
          serviceType,
          startDate,
          endDate,
          frequencyWeeks,
          dayOfWeek,
          prepaid,
          defaultPrice: total > 0 ? String(total) : null,
        })
        .returning()

      const dates = occurrenceDates(startDate, endDate, dayOfWeek, frequencyWeeks)
      if (dates.length === 0) {
        return { ok: true, scheduleId: schedule.id, occurrenceCount: 0, note: 'No occurrences fall within the date range.' }
      }

      const inserted = await db
        .insert(services)
        .values(
          dates.map((serviceDate) => ({
            customerId,
            serviceDate,
            serviceType,
            qboItemId: qboItemId ?? null,
            status: 'scheduled' as const,
            recurringScheduleId: schedule.id,
            totalPrice: total > 0 ? String(total) : null,
          }))
        )
        .returning({ id: services.id })

      for (const svc of inserted) await insertServiceBoats(svc.id, boatLines)

      await mcpLog({ userId: ownerId, action: 'create_recurring_schedule', entityType: 'recurring_schedule', entityId: schedule.id, metadata: { customerId, serviceType, frequencyWeeks, dayOfWeek, occurrenceCount: inserted.length } })
      return { ok: true, scheduleId: schedule.id, occurrenceCount: inserted.length, total, serviceIds: inserted.map((s) => s.id) }
    }
  )

  tool(
    server,
    'add_tip',
    'Record a tip amount on a service. Refreshes payroll so the tip is split among assigned employees.',
    {
      serviceId: z.string().uuid().describe('Service UUID'),
      tipAmount: z.number().nonnegative().describe('Tip amount in dollars'),
    },
    async ({ serviceId, tipAmount }) => {
      const ownerId = await getOwnerId()
      const [service] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1)
      if (!service) return { ok: false, error: 'Service not found.' }

      await db.update(services).set({ tipAmount: String(tipAmount) }).where(eq(services.id, serviceId))
      await refreshServicePayroll(serviceId, 'tip_updated')
      await mcpLog({ userId: ownerId, action: 'add_tip', entityType: 'service', entityId: serviceId, metadata: { tipAmount } })
      return { ok: true, serviceId, tipAmount }
    }
  )
}
