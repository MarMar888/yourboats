import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { boats, services } from '@/lib/db/schema'
import { getClientSession } from '@/lib/auth/client-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewServiceForm } from './new-service-form'

export default async function RequestServicePage() {
  const session = await getClientSession()
  if (!session) redirect('/login')

  const [typeRows, customerBoats] = await Promise.all([
    db.selectDistinct({ serviceType: services.serviceType }).from(services).orderBy(sql`1`).limit(20),
    db.select({ id: boats.id, nickname: boats.nickname }).from(boats).where(eq(boats.customerId, session.customerId)).orderBy(boats.nickname),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Request a service</CardTitle>
      </CardHeader>
      <CardContent>
        <NewServiceForm serviceTypes={typeRows.map((r) => r.serviceType)} boats={customerBoats} />
      </CardContent>
    </Card>
  )
}
