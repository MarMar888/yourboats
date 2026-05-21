import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import {
  serviceBoats,
  services,
  boats,
  customers,
  timeEntries,
} from '@/lib/db/schema'
import { eq, and, isNull, ne } from 'drizzle-orm'
import { ClockClient } from './clock-client'
import { todayET } from '@/lib/date'

function todayYMD(): string {
  return todayET()
}

export default async function ClockPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = todayYMD()

  // All boat+service combos scheduled today — not filtered by assignment
  const assigned = await db
    .select({
      serviceId: serviceBoats.serviceId,
      boatId: serviceBoats.boatId,
      boatNickname: boats.nickname,
      customerName: customers.name,
    })
    .from(serviceBoats)
    .innerJoin(services, eq(services.id, serviceBoats.serviceId))
    .innerJoin(boats, eq(boats.id, serviceBoats.boatId))
    .innerJoin(customers, eq(customers.id, services.customerId))
    .where(
      and(
        eq(services.serviceDate, today),
        ne(services.status, 'cancelled')
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
