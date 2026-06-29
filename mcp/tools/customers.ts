// Customer and boat tools: list/get customers, create/update customers and boats.
// Customer updates sync name/email back to QBO when the customer is QBO-linked,
// mirroring app/(app)/customers/[id]/edit/actions.ts.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { customers, boats, services, complaints, invoices } from '../../lib/db/schema'
import { getQboClient } from '../../lib/qbo/client'
import { getActorId } from '../actor'
import { mcpLog } from '../log'
import { tool } from './_util'

export function registerCustomerTools(server: McpServer): void {
  tool(
    server,
    'list_customers',
    'List customers with boat counts, QBO sync status, and prepaid flag. Optionally filter by name substring or QBO-linked status.',
    {
      search: z.string().optional().describe('Case-insensitive substring match on customer name'),
      qboLinkedOnly: z.boolean().optional().describe('If true, only customers with a QBO ID'),
      limit: z.number().int().min(1).max(1000).optional().describe('Max rows (default 200)'),
    },
    async ({ search, qboLinkedOnly, limit }) => {
      const conds = []
      if (search) conds.push(sql`${customers.name} ILIKE ${'%' + search + '%'}`)
      if (qboLinkedOnly) conds.push(sql`${customers.qboCustomerId} IS NOT NULL`)

      const rows = await db
        .select({
          id: customers.id,
          name: customers.name,
          email: customers.email,
          phone: customers.phone,
          address: customers.address,
          isPrepaid: customers.isPrepaid,
          qboCustomerId: customers.qboCustomerId,
          boatCount: sql<number>`(select count(*) from ${boats} where ${boats.customerId} = ${customers.id})`,
        })
        .from(customers)
        .where(conds.length ? sql.join(conds, sql` AND `) : undefined)
        .orderBy(customers.name)
        .limit(limit ?? 200)

      return { ok: true, count: rows.length, customers: rows }
    }
  )

  tool(
    server,
    'get_customer',
    'Get a customer with their boats, recent services (last 20), open complaints, and recent invoices.',
    {
      customerId: z.string().uuid().describe('Customer UUID'),
    },
    async ({ customerId }) => {
      const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1)
      if (!customer) return { ok: false, error: 'Customer not found.' }

      const boatRows = await db
        .select({ id: boats.id, nickname: boats.nickname, makeModel: boats.makeModel, lengthFt: boats.lengthFt, notes: boats.notes })
        .from(boats)
        .where(eq(boats.customerId, customerId))

      const recentServices = await db
        .select({ id: services.id, serviceDate: services.serviceDate, serviceType: services.serviceType, status: services.status, totalPrice: services.totalPrice })
        .from(services)
        .where(eq(services.customerId, customerId))
        .orderBy(desc(services.serviceDate))
        .limit(20)

      const openComplaints = await db
        .select({ id: complaints.id, severity: complaints.severity, description: complaints.description, resolved: complaints.resolved, createdAt: complaints.createdAt })
        .from(complaints)
        .where(sql`${complaints.customerId} = ${customerId} AND ${complaints.resolved} = false`)

      const recentInvoices = await db
        .select({ id: invoices.id, amount: invoices.amount, status: invoices.status, docNumber: invoices.docNumber, qboInvoiceId: invoices.qboInvoiceId })
        .from(invoices)
        .innerJoin(services, eq(invoices.serviceId, services.id))
        .where(eq(services.customerId, customerId))
        .orderBy(desc(invoices.createdAt))
        .limit(20)

      return { ok: true, customer, boats: boatRows, recentServices, openComplaints, recentInvoices }
    }
  )

  tool(
    server,
    'create_customer',
    'Create a new customer record (local only — not pushed to QBO). Use update_customer later to sync once they have a QBO ID.',
    {
      name: z.string().min(1).describe('Customer display name'),
      email: z.string().optional().describe('Primary email'),
      phone: z.string().optional().describe('Phone number'),
      address: z.string().optional().describe('Service address'),
      notes: z.string().optional().describe('Internal notes'),
      isPrepaid: z.boolean().default(false).describe('Prepaid customers are never invoiced'),
    },
    async ({ name, email, phone, address, notes, isPrepaid }) => {
      const actorId = getActorId()
      const [customer] = await db
        .insert(customers)
        .values({ name, email: email ?? null, phone: phone ?? null, address: address ?? null, notes: notes ?? null, isPrepaid })
        .returning()
      await mcpLog({ userId: actorId, action: 'create_customer', entityType: 'customer', entityId: customer.id, metadata: { name } })
      return { ok: true, customerId: customer.id, customer }
    }
  )

  tool(
    server,
    'update_customer',
    'Update a customer. If the customer is QBO-linked, name and email changes are synced to QuickBooks (non-fatal if QBO is unavailable).',
    {
      customerId: z.string().uuid().describe('Customer UUID'),
      name: z.string().min(1).optional().describe('New display name'),
      email: z.string().nullable().optional().describe('New email (null to clear)'),
      phone: z.string().nullable().optional().describe('New phone (null to clear)'),
      address: z.string().nullable().optional().describe('New address (null to clear)'),
      notes: z.string().nullable().optional().describe('New notes (null to clear)'),
      isPrepaid: z.boolean().optional().describe('Update prepaid flag'),
    },
    async ({ customerId, name, email, phone, address, notes, isPrepaid }) => {
      const actorId = getActorId()
      const [existing] = await db.select({ qboCustomerId: customers.qboCustomerId, name: customers.name }).from(customers).where(eq(customers.id, customerId)).limit(1)
      if (!existing) return { ok: false, error: 'Customer not found.' }

      const patch: Record<string, unknown> = { updatedAt: new Date() }
      if (name !== undefined) patch.name = name
      if (email !== undefined) patch.email = email
      if (phone !== undefined) patch.phone = phone
      if (address !== undefined) patch.address = address
      if (notes !== undefined) patch.notes = notes
      if (isPrepaid !== undefined) patch.isPrepaid = isPrepaid
      await db.update(customers).set(patch).where(eq(customers.id, customerId))

      let qboSynced = false
      let qboError: string | undefined
      if (existing.qboCustomerId && (name !== undefined || email !== undefined)) {
        try {
          const qbo = await getQboClient()
          const current = await new Promise<{ Id: string; SyncToken: string }>((resolve, reject) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            qbo.getCustomer(existing.qboCustomerId!, (err: unknown, result: any) => (err ? reject(err) : resolve(result)))
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const qboPatch: Record<string, any> = { Id: current.Id, SyncToken: current.SyncToken, sparse: true, DisplayName: name ?? existing.name }
          if (email !== undefined) qboPatch.PrimaryEmailAddr = email ? { Address: email } : null
          await new Promise<void>((resolve, reject) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            qbo.updateCustomer(qboPatch, (err: unknown, _r: any) => (err ? reject(err) : resolve()))
          )
          await db.update(customers).set({ lastSyncedAt: new Date() }).where(eq(customers.id, customerId))
          qboSynced = true
        } catch (err) {
          qboError = err instanceof Error ? err.message : String(err)
        }
      }

      await mcpLog({ userId: actorId, action: 'update_customer', entityType: 'customer', entityId: customerId, metadata: { qboSynced } })
      return { ok: true, customerId, qboSynced, ...(qboError ? { qboError } : {}) }
    }
  )

  tool(
    server,
    'create_boat',
    'Add a new boat to a customer. Length (ft) is used for per-foot service pricing.',
    {
      customerId: z.string().uuid().describe('Owner customer UUID'),
      nickname: z.string().min(1).describe('Boat nickname / name'),
      makeModel: z.string().optional().describe('Make and model'),
      lengthFt: z.number().int().positive().optional().describe('Length in feet (drives per_ft pricing)'),
      notes: z.string().optional().describe('Notes about the boat'),
    },
    async ({ customerId, nickname, makeModel, lengthFt, notes }) => {
      const actorId = getActorId()
      const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1)
      if (!customer) return { ok: false, error: 'Customer not found.' }
      const [boat] = await db
        .insert(boats)
        .values({ customerId, nickname, makeModel: makeModel ?? null, lengthFt: lengthFt ?? null, notes: notes ?? null })
        .returning()
      await mcpLog({ userId: actorId, action: 'create_boat', entityType: 'boat', entityId: boat.id, metadata: { customerId, nickname } })
      return { ok: true, boatId: boat.id, boat }
    }
  )

  tool(
    server,
    'update_boat',
    'Update a boat record (nickname, make/model, length, notes).',
    {
      boatId: z.string().uuid().describe('Boat UUID'),
      nickname: z.string().min(1).optional().describe('New nickname'),
      makeModel: z.string().nullable().optional().describe('New make/model (null to clear)'),
      lengthFt: z.number().int().positive().nullable().optional().describe('New length in feet (null to clear)'),
      notes: z.string().nullable().optional().describe('New notes (null to clear)'),
    },
    async ({ boatId, nickname, makeModel, lengthFt, notes }) => {
      const actorId = getActorId()
      const [existing] = await db.select({ id: boats.id }).from(boats).where(eq(boats.id, boatId)).limit(1)
      if (!existing) return { ok: false, error: 'Boat not found.' }

      const patch: Record<string, unknown> = {}
      if (nickname !== undefined) patch.nickname = nickname
      if (makeModel !== undefined) patch.makeModel = makeModel
      if (lengthFt !== undefined) patch.lengthFt = lengthFt
      if (notes !== undefined) patch.notes = notes
      if (Object.keys(patch).length === 0) return { ok: false, error: 'No fields to update.' }

      await db.update(boats).set(patch).where(eq(boats.id, boatId))
      await mcpLog({ userId: actorId, action: 'update_boat', entityType: 'boat', entityId: boatId })
      return { ok: true, boatId }
    }
  )
}
