import { db } from '@/lib/db'
import { users, tierConfig } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { redirect } from 'next/navigation'
import { PayClient } from './pay-client'

export default async function PayPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    redirect('/dashboard')
  }

  const [employees, tierRows] = await Promise.all([
    db
      .select({ id: users.id, displayName: users.displayName, tier: users.tier })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.displayName)),
    db.select().from(tierConfig).orderBy(tierConfig.tier),
  ])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Pay</h1>
      <PayClient
        employees={employees}
        tierRows={tierRows as { tier: 'top' | 'mid' | 'low'; deductionPct: string }[]}
        isOwner={currentUser.role === 'owner'}
      />
    </div>
  )
}
