import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { boats, serviceBoats, services } from '@/lib/db/schema'
import { getClientSession } from '@/lib/auth/client-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatServiceDate, formatServiceType } from '../../format'
import { ServiceRequestForm } from './service-request-form'

export default async function ClientServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getClientSession()
  if (!session) redirect('/login')

  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, id), eq(services.customerId, session.customerId)))
    .limit(1)
  if (!service) notFound()

  const serviceBoatRows = await db
    .select({ nickname: boats.nickname })
    .from(serviceBoats)
    .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
    .where(eq(serviceBoats.serviceId, id))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{formatServiceType(service.serviceType)}</CardTitle>
            <Badge variant={service.status === 'scheduled' ? 'secondary' : service.status === 'complete' ? 'success' : 'destructive'}>
              {service.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{formatServiceDate(service.serviceDate)}</p>
          {serviceBoatRows.length > 0 && (
            <p className="text-muted-foreground">{serviceBoatRows.map((b) => b.nickname).join(', ')}</p>
          )}
        </CardContent>
      </Card>

      {service.status === 'scheduled' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Need something changed?</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceRequestForm serviceId={service.id} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
