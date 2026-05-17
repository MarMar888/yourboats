'use server'

import { db } from '@/lib/db'
import { services, serviceBoats, serviceBoatAssignments, invoices, recurringSchedules, boats, customers } from '@/lib/db/schema'
import { getQboClient } from '@/lib/qbo/client'
import { findBestQboItem } from '@/lib/qbo/items'
import { eq, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { log } from '@/lib/log'
import { getCurrentUser } from '@/lib/auth/get-current-user'

// Returns every occurrence of dayOfWeek (0=Sun…6=Sat) between start and end
// at the given frequency in weeks, as YYYY-MM-DD strings.
function occurrenceDates(
  startDate: string,
  endDate: string,
  dayOfWeek: number,
  frequencyWeeks: number
): string[] {
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

function parseBoatRows(formData: FormData) {
  const boatIds = formData.getAll('boatIds') as string[]
  return boatIds.map((boatId) => ({
    boatId,
    description: (formData.get(`boat_desc_${boatId}`) as string) || null,
    notes: (formData.get(`boat_notes_${boatId}`) as string) || null,
    rateType: (formData.get(`boat_rateType_${boatId}`) as 'per_ft' | 'flat') ?? 'per_ft',
    rate: (formData.get(`boat_rate_${boatId}`) as string) || null,
    assignedUserIds: formData.getAll(`boat_employees_${boatId}`) as string[],
  }))
}

// ─── QBO invoice helper ───────────────────────────────────────────────────────

type BoatLineInput = {
  boatId: string
  description: string | null
  notes: string | null
  rateType: 'per_ft' | 'flat'
  rate: string | null
  assignedUserIds: string[]
}

async function insertBoatAssignments(serviceId: string, boatRows: BoatLineInput[]) {
  const rows = boatRows.flatMap((b) =>
    b.assignedUserIds.map((userId) => ({ serviceId, boatId: b.boatId, userId }))
  )
  if (rows.length > 0) {
    await db.insert(serviceBoatAssignments).values(rows).onConflictDoNothing()
  }
}

async function pushInvoiceToQbo(opts: {
  qboCustomerId: string
  serviceDate: string
  boatLines: BoatLineInput[]
  boatLengths: Record<string, number | null>
  qboItemId: string
  qboItemName: string
}): Promise<string> {
  const qbo = await getQboClient()
  const { qboCustomerId, serviceDate, boatLines, boatLengths, qboItemId, qboItemName } = opts

  const dueDate = new Date(serviceDate + 'T00:00:00')
  dueDate.setDate(dueDate.getDate() + 30)

  const lines = boatLines.map((b) => {
    const rate = Number(b.rate ?? 0)
    const qty = b.rateType === 'per_ft' ? (boatLengths[b.boatId] ?? 1) : 1
    const amount = rate * qty
    return {
      Amount: amount,
      DetailType: 'SalesItemLineDetail',
      Description: b.description ?? '',
      SalesItemLineDetail: {
        ItemRef: { value: qboItemId, name: qboItemName },
        UnitPrice: rate,
        Qty: qty,
        ServiceDate: serviceDate,
      },
    }
  })

  const created = await new Promise<{ Id: string }>((resolve, reject) =>
    qbo.createInvoice(
      {
        CustomerRef: { value: qboCustomerId },
        TxnDate: serviceDate,
        DueDate: dueDate.toISOString().split('T')[0],
        Line: lines,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: unknown, result: any) => (err ? reject(err) : resolve(result))
    )
  )

  return created.Id
}

// ─── Main action ──────────────────────────────────────────────────────────────

export async function createService(formData: FormData) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) redirect('/dashboard')

  const mode = formData.get('mode') as 'onetime' | 'recurring'
  const customerId = formData.get('customerId') as string
  const serviceType = formData.get('serviceType') as string
  const boatRows = parseBoatRows(formData)

  if (mode === 'onetime') {
    const serviceDate = formData.get('serviceDate') as string
    const notes = formData.get('notes') as string

    // Pre-fetch boat lengths to compute total
    const boatIds = boatRows.map((b) => b.boatId)
    const boatRecords = boatIds.length
      ? await db.select({ id: boats.id, lengthFt: boats.lengthFt }).from(boats).where(inArray(boats.id, boatIds))
      : []
    const boatLengths: Record<string, number | null> = Object.fromEntries(
      boatRecords.map((b) => [b.id, b.lengthFt])
    )
    const total = boatRows.reduce((sum, b) => {
      const rate = Number(b.rate ?? 0)
      const qty = b.rateType === 'per_ft' ? (boatLengths[b.boatId] ?? 0) : 1
      return sum + rate * qty
    }, 0)

    const [service] = await db
      .insert(services)
      .values({
        customerId,
        serviceDate,
        serviceType: serviceType as never,
        status: 'scheduled',
        notes: notes || null,
        totalPrice: total > 0 ? String(total) : null,
      })
      .returning()

    if (boatRows.length > 0) {
      await db.insert(serviceBoats).values(
        boatRows.map(({ assignedUserIds: _a, ...b }) => ({ serviceId: service.id, ...b }))
      )
      await insertBoatAssignments(service.id, boatRows)
    }

    // Create a draft invoice so it appears in the invoice queue
    const [invoice] = await db
      .insert(invoices)
      .values({
        serviceId: service.id,
        amount: String(total),
        status: 'draft',
      })
      .returning()

    await db.update(services).set({ invoiceId: invoice.id }).where(eq(services.id, service.id))
    await log({ action: 'create_service', entityType: 'service', entityId: service.id, metadata: { customerId, serviceDate, serviceType, mode: 'onetime' } })
  } else {
    const startDate = formData.get('startDate') as string
    const endDate = formData.get('endDate') as string
    const frequencyWeeks = Number(formData.get('frequencyWeeks') ?? 1)
    const dayOfWeek = Number(formData.get('dayOfWeek') ?? 1)

    // ── Pre-fetch data needed for invoice generation ──────────────────────────

    const [customer] = await db
      .select({ qboCustomerId: customers.qboCustomerId })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)

    // Boat lengths for per_ft calculations
    const boatIds = boatRows.map((b) => b.boatId)
    const boatRecords = boatIds.length
      ? await db.select({ id: boats.id, lengthFt: boats.lengthFt }).from(boats).where(inArray(boats.id, boatIds))
      : []
    const boatLengths: Record<string, number | null> = Object.fromEntries(
      boatRecords.map((b) => [b.id, b.lengthFt])
    )

    // QBO item ref — try cache first, then fall back to live lookup
    let qboItemId: string | null = null
    let qboItemName = 'Services'
    try {
      const cachedItem = await findBestQboItem(serviceType)
      if (cachedItem) {
        qboItemId = cachedItem.id
        qboItemName = cachedItem.name
      } else {
        // Cache empty — fall back to live QBO lookup
        const qbo = await getQboClient()
        const itemsRes = await new Promise<{ QueryResponse?: { Item?: { Id: string; Name: string }[] } }>(
          (resolve, reject) =>
            qbo.findItems(
              [{ field: 'fetchAll', value: true }],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (err: unknown, result: any) => (err ? reject(err) : resolve(result))
            )
        )
        const items = itemsRes.QueryResponse?.Item ?? []
        const serviceItem = items.find((i) => i.Name.toLowerCase().includes('recurring') || i.Name.toLowerCase().includes('service')) ?? items[0]
        if (serviceItem) {
          qboItemId = serviceItem.Id
          qboItemName = serviceItem.Name
        }
      }
    } catch {
      // QBO not connected or item lookup failed — we'll still create DB records
    }

    // ── Create recurring schedule ─────────────────────────────────────────────

    const [schedule] = await db
      .insert(recurringSchedules)
      .values({
        customerId,
        serviceType: serviceType as never,
        startDate,
        endDate,
        frequencyWeeks,
        dayOfWeek,
      })
      .returning()

    // ── Expand into service + invoice per occurrence ──────────────────────────

    const dates = occurrenceDates(startDate, endDate, dayOfWeek, frequencyWeeks)

    // Compute total per visit from boat rows
    const totalPerVisit = boatRows.reduce((sum, b) => {
      const rate = Number(b.rate ?? 0)
      const qty = b.rateType === 'per_ft' ? (boatLengths[b.boatId] ?? 0) : 1
      return sum + rate * qty
    }, 0)

    for (const serviceDate of dates) {
      // 1. Service row
      const [service] = await db
        .insert(services)
        .values({
          customerId,
          serviceDate,
          serviceType: serviceType as never,
          status: 'scheduled',
          recurringScheduleId: schedule.id,
          totalPrice: totalPerVisit > 0 ? String(totalPerVisit) : null,
        })
        .returning()

      // 2. ServiceBoats rows + assignments
      if (boatRows.length > 0) {
        await db.insert(serviceBoats).values(
          boatRows.map(({ assignedUserIds: _a, ...b }) => ({ serviceId: service.id, ...b }))
        )
        await insertBoatAssignments(service.id, boatRows)
      }

      // 3. Invoice row (draft by default)
      const [invoice] = await db
        .insert(invoices)
        .values({
          serviceId: service.id,
          amount: String(totalPerVisit),
          status: 'draft',
        })
        .returning()

      // 4. Link invoice back to service
      await db.update(services).set({ invoiceId: invoice.id }).where(eq(services.id, service.id))
      await log({ action: 'create_service', entityType: 'service', entityId: service.id, metadata: { customerId, serviceDate, serviceType, mode: 'recurring', recurringScheduleId: schedule.id } })

      // 5. Push to QBO if connected and we have a customer QBO ID
      if (qboItemId && customer?.qboCustomerId && boatRows.length > 0) {
        try {
          const qboInvoiceId = await pushInvoiceToQbo({
            qboCustomerId: customer.qboCustomerId,
            serviceDate,
            boatLines: boatRows,
            boatLengths,
            qboItemId,
            qboItemName,
          })

          await db
            .update(invoices)
            .set({ qboInvoiceId, status: 'sent', sentAt: new Date(), lastSyncedAt: new Date() })
            .where(eq(invoices.id, invoice.id))
        } catch {
          // QBO push failed for this occurrence — invoice stays as draft
        }
      }
    }
  }

  redirect('/schedule')
}
