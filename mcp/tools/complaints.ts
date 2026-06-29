// Complaint tools: list, file, and resolve service complaints.
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { complaints, customers, services } from '../../lib/db/schema'
import { getActorId } from '../actor'
import { mcpLog } from '../log'
import { tool } from './_util'

export function registerComplaintTools(server: McpServer): void {
  tool(
    server,
    'list_complaints',
    'List complaints with customer name and service date. Optionally filter by resolved status.',
    {
      resolved: z.boolean().optional().describe('If set, filter to resolved (true) or open (false) complaints'),
      limit: z.number().int().min(1).max(500).optional().describe('Max rows (default 100)'),
    },
    async ({ resolved, limit }) => {
      const conds = []
      if (resolved !== undefined) conds.push(eq(complaints.resolved, resolved))
      const rows = await db
        .select({
          id: complaints.id,
          severity: complaints.severity,
          description: complaints.description,
          resolved: complaints.resolved,
          resolvedAt: complaints.resolvedAt,
          createdAt: complaints.createdAt,
          serviceId: complaints.serviceId,
          serviceDate: services.serviceDate,
          customerName: customers.name,
        })
        .from(complaints)
        .innerJoin(customers, eq(complaints.customerId, customers.id))
        .innerJoin(services, eq(complaints.serviceId, services.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(complaints.createdAt))
        .limit(limit ?? 100)
      return { ok: true, count: rows.length, complaints: rows }
    }
  )

  tool(
    server,
    'create_complaint',
    'File a complaint against a service. Provide the service ID; the customer is inferred from the service.',
    {
      serviceId: z.string().uuid().describe('Service UUID the complaint is about'),
      description: z.string().min(1).describe('What went wrong'),
      severity: z.enum(['minor', 'major']).describe('Complaint severity'),
    },
    async ({ serviceId, description, severity }) => {
      const actorId = getActorId()
      const [svc] = await db.select({ customerId: services.customerId }).from(services).where(eq(services.id, serviceId)).limit(1)
      if (!svc) return { ok: false, error: 'Service not found.' }

      const [complaint] = await db
        .insert(complaints)
        .values({ serviceId, customerId: svc.customerId, description: description.trim(), severity, resolved: false, createdByUserId: actorId })
        .returning()
      await mcpLog({ userId: actorId, action: 'flag_complaint', entityType: 'service', entityId: serviceId, metadata: { complaintId: complaint.id, severity } })
      return { ok: true, complaintId: complaint.id }
    }
  )

  tool(
    server,
    'resolve_complaint',
    'Mark a complaint as resolved.',
    {
      complaintId: z.string().uuid().describe('Complaint UUID'),
    },
    async ({ complaintId }) => {
      const actorId = getActorId()
      const [existing] = await db.select({ id: complaints.id, resolved: complaints.resolved }).from(complaints).where(eq(complaints.id, complaintId)).limit(1)
      if (!existing) return { ok: false, error: 'Complaint not found.' }
      if (existing.resolved) return { ok: true, complaintId, alreadyResolved: true }

      await db.update(complaints).set({ resolved: true, resolvedAt: new Date() }).where(eq(complaints.id, complaintId))
      await mcpLog({ userId: actorId, action: 'resolve_complaint', entityType: 'complaint', entityId: complaintId })
      return { ok: true, complaintId }
    }
  )
}
