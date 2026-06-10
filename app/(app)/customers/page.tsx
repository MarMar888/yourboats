import { db } from '@/lib/db'
import { customers, boats, services } from '@/lib/db/schema'
import { sql, gte } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import CustomersTable, { type CustomerRow } from './customers-table'

const SEASON_START = `${new Date().getFullYear()}-01-01`

export default async function CustomersPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    redirect('/dashboard')
  }

  const [rows, boatCounts, serviceCounts, seasonCounts] = await Promise.all([
    db
      .select({
        id:        customers.id,
        name:      customers.name,
        email:     customers.email,
        phone:     customers.phone,
        notes:     customers.notes,
        isPrepaid: customers.isPrepaid,
      })
      .from(customers)
      .orderBy(customers.name),
    db
      .select({
        customerId: boats.customerId,
        count:      sql<number>`count(*)::int`.as('count'),
      })
      .from(boats)
      .groupBy(boats.customerId),
    db
      .select({
        customerId: services.customerId,
        count:      sql<number>`count(*)::int`.as('count'),
      })
      .from(services)
      .groupBy(services.customerId),
    db
      .select({
        customerId: services.customerId,
        count:      sql<number>`count(*)::int`.as('count'),
      })
      .from(services)
      .where(gte(services.serviceDate, SEASON_START))
      .groupBy(services.customerId),
  ])

  const boatMap = new Map(boatCounts.map((r) => [r.customerId, r.count]))
  const svcMap  = new Map(serviceCounts.map((r) => [r.customerId, r.count]))
  const seasMap = new Map(seasonCounts.map((r) => [r.customerId, r.count]))

  const tableRows: CustomerRow[] = rows.map((c) => ({
    id:                 c.id,
    name:               c.name,
    email:              c.email,
    phone:              c.phone,
    notes:              c.notes,
    isPrepaid:          c.isPrepaid,
    boatCount:          boatMap.get(c.id) ?? 0,
    totalServices:      svcMap.get(c.id) ?? 0,
    thisSeasonServices: seasMap.get(c.id) ?? 0,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Button asChild size="sm">
          <Link href="/customers/new">+ Add customer</Link>
        </Button>
      </div>

      <CustomersTable customers={tableRows} />
    </div>
  )
}
