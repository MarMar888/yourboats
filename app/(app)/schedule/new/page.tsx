import { db } from '@/lib/db'
import { customers, boats } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import ServiceForm from './service-form'

export default async function NewServicePage() {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  const canAssign = devUser?.role === 'owner' || devUser?.role === 'manager'

  const [allCustomers, allBoats] = await Promise.all([
    db.select().from(customers).orderBy(asc(customers.name)),
    db.select().from(boats),
  ])

  const boatsByCustomer = allBoats.reduce<Record<string, typeof allBoats>>(
    (acc, boat) => {
      ;(acc[boat.customerId] ??= []).push(boat)
      return acc
    },
    {}
  )

  // Employee list — use dev users for now; real users table when auth lands
  const employees = DEV_USERS.map((u) => ({ id: u.id, displayName: u.displayName }))

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/schedule">← Back</Link>
        </Button>
        <h1 className="text-2xl font-semibold">New service</h1>
      </div>

      <ServiceForm
        customers={allCustomers}
        boatsByCustomer={boatsByCustomer}
        employees={employees}
        canAssign={canAssign}
      />
    </div>
  )
}
