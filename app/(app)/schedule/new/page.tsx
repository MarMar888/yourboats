import { db } from '@/lib/db'
import { customers, boats, users } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import ServiceForm from './service-form'
import { redirect } from 'next/navigation'

export default async function NewServicePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    redirect('/dashboard')
  }
  const canAssign = true // all managers and owners can assign

  const [allCustomers, allBoats, allUsers] = await Promise.all([
    db.select().from(customers).orderBy(asc(customers.name)),
    db.select().from(boats),
    db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.active, true)).orderBy(asc(users.displayName)),
  ])

  const boatsByCustomer = allBoats.reduce<Record<string, typeof allBoats>>(
    (acc, boat) => {
      ;(acc[boat.customerId] ??= []).push(boat)
      return acc
    },
    {}
  )

  const employees = allUsers

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
