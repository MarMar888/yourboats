import { db } from '@/lib/db'
import { timeEntries, users, services, customers, boats } from '@/lib/db/schema'
import { eq, desc, and, gte, lte } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { TimePageClient } from './time-page-client'

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; userId?: string }>
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    redirect('/dashboard')
  }

  const { from, to, userId: filterUserId } = await searchParams

  // Default date range: last 30 days
  const toDate = to ? new Date(to + 'T23:59:59') : new Date()
  const fromDate = from
    ? new Date(from + 'T00:00:00')
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const conditions = [
    gte(timeEntries.clockIn, fromDate),
    lte(timeEntries.clockIn, toDate),
  ]
  if (filterUserId) {
    conditions.push(eq(timeEntries.userId, filterUserId))
  }

  const rows = await db
    .select({
      id:              timeEntries.id,
      userId:          timeEntries.userId,
      boatId:          timeEntries.boatId,
      clockIn:         timeEntries.clockIn,
      clockOut:        timeEntries.clockOut,
      notes:           timeEntries.notes,
      employeeName:    users.displayName,
      boatNickname:    boats.nickname,
      serviceId:       services.id,
      serviceDate:     services.serviceDate,
      serviceType:     services.serviceType,
      customerName:    customers.name,
    })
    .from(timeEntries)
    .leftJoin(users,      eq(timeEntries.userId,    users.id))
    .leftJoin(boats,      eq(timeEntries.boatId,    boats.id))
    .leftJoin(services,   eq(timeEntries.serviceId, services.id))
    .leftJoin(customers,  eq(services.customerId,   customers.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.clockIn))

  const allEmployees = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(users.displayName)

  // Compute totals per employee
  const totalByUser = new Map<string, number>()
  for (const r of rows) {
    if (!r.clockOut) continue
    const mins = Math.floor((r.clockOut.getTime() - r.clockIn.getTime()) / 60000)
    totalByUser.set(r.userId, (totalByUser.get(r.userId) ?? 0) + mins)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Time</h1>
      <TimePageClient
        rows={rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          employeeName: r.employeeName ?? 'Unknown',
          boatNickname: r.boatNickname ?? null,
          clockIn: r.clockIn,
          clockOut: r.clockOut ?? null,
          notes: r.notes ?? null,
          serviceId: r.serviceId ?? null,
          serviceDate: r.serviceDate ?? null,
          serviceType: r.serviceType ?? null,
          customerName: r.customerName ?? null,
        }))}
        employees={allEmployees}
        totalByUser={Object.fromEntries(totalByUser)}
        defaultFrom={[fromDate.getFullYear(), String(fromDate.getMonth()+1).padStart(2,'0'), String(fromDate.getDate()).padStart(2,'0')].join('-')}
        defaultTo={[toDate.getFullYear(), String(toDate.getMonth()+1).padStart(2,'0'), String(toDate.getDate()).padStart(2,'0')].join('-')}
        defaultUserId={filterUserId ?? ''}
      />
    </div>
  )
}
