import { db } from '@/lib/db'
import { customers, boats } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import ServiceForm from './service-form'
import { redirect } from 'next/navigation'
import { getCachedQboItems } from '@/lib/qbo/items'

export default async function NewServicePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    redirect('/dashboard')
  }

  const [allCustomers, allBoats, qboItems] = await Promise.all([
    db.select().from(customers).orderBy(asc(customers.name)),
    db.select().from(boats),
    getCachedQboItems(),
  ])

  const boatsByCustomer = allBoats.reduce<Record<string, typeof allBoats>>(
    (acc, boat) => {
      ;(acc[boat.customerId] ??= []).push(boat)
      return acc
    },
    {}
  )

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
        qboItems={qboItems.map((i) => ({ id: i.qboItemId, name: i.name }))}
      />
    </div>
  )
}
