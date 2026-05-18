import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import {
  serviceBoatAssignments,
  services,
  boats,
  customers,
  timeEntries,
} from '@/lib/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { ClockClient } from './clock-client'

function todayYMD(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default async function ClockPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = todayYMD()

  // All boat+service combos assigned to this user today
  const assigned = await db
    .select({
      serviceId: serviceBoatAssignments.serviceId,
      boatId: serviceBoatAssignments.boatId,
      boatNickname: boats.nickname,
      customerName: customers.name,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
    })
    .from(serviceBoatAssignments)
    .innerJoin(services, eq(services.id, serviceBoatAssignments.serviceId))
    .innerJoin(boats, eq(boats.id, serviceBoatAssignments.boatId))
    .innerJoin(customers, eq(customers.id, services.customerId))
    .where(
      and(
        eq(serviceBoatAssignments.userId, user.id), // text = uuid cast fine in PG
        eq(services.serviceDate, today),
        eq(services.status, 'scheduled')
      )
    )
    .orderBy(customers.name, boats.nickname)

  // Any open time entry for this user (clocked in but not out)
  const [openEntry] = await db
    .select({
      id: timeEntries.id,
      serviceId: timeEntries.serviceId,
      boatId: timeEntries.boatId,
      clockIn: timeEntries.clockIn,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, user.id),
        isNull(timeEntries.clockOut)
      )
    )
    .limit(1)

  return (
    <ClockClient
      userId={user.id}
      assigned={assigned.map((a) => ({
        serviceId: a.serviceId,
        boatId: a.boatId,
        label: `${a.customerName} / ${a.boatNickname}`,
      }))}
      openEntry={openEntry
        ? {
            id: openEntry.id,
            serviceId: openEntry.serviceId,
            boatId: openEntry.boatId ?? null,
            clockIn: openEntry.clockIn.toISOString(),
          }
        : null}
    />
  )
}
