import { db } from '@/lib/db'
import { users, tierConfig, serviceTypeShares } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { PayClient } from './pay-client'
import { EmployeePayView } from './employee-pay-view'

export default async function PayPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  // Employees see a simplified self-service view
  if (currentUser.role === 'employee') {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">My Pay</h1>
        <EmployeePayView />
      </div>
    )
  }

  if (currentUser.role !== 'owner' && currentUser.role !== 'manager') {
    redirect('/dashboard')
  }

  const [employees, tierRows, serviceTypeShareRows] = await Promise.all([
    db
      .select({ id: users.id, displayName: users.displayName, tier: users.tier })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.displayName)),
    db.select().from(tierConfig).orderBy(tierConfig.tier),
    db.select().from(serviceTypeShares).orderBy(asc(serviceTypeShares.serviceType)),
  ])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Pay</h1>
      <PayClient
        employees={employees}
        tierRows={tierRows as { tier: 'top' | 'mid' | 'low'; deductionPct: string }[]}
        serviceTypeShares={serviceTypeShareRows.map((r) => ({
          serviceType: r.serviceType,
          employeeSharePct: r.employeeSharePct,
        }))}
        isOwner={currentUser.role === 'owner'}
      />
    </div>
  )
}
