import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { serviceRequests } from '@/lib/db/schema'
import { getClientSession } from '@/lib/auth/client-session'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatServiceType } from '../format'

const TYPE_LABEL: Record<string, string> = {
  reschedule: 'Move request',
  cancel: 'Cancellation request',
  note: 'Note',
  new_service: 'New service request',
}

function statusVariant(status: string) {
  if (status === 'approved') return 'success' as const
  if (status === 'denied') return 'destructive' as const
  return 'secondary' as const
}

export default async function ClientRequestsPage() {
  const session = await getClientSession()
  if (!session) redirect('/login')

  const rows = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.customerId, session.customerId))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50)

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No requests yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-1.5 pt-4 pb-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {TYPE_LABEL[r.type]}
                {r.serviceType ? ` · ${formatServiceType(r.serviceType)}` : ''}
              </span>
              <Badge variant={statusVariant(r.status)} className="capitalize">
                {r.status}
              </Badge>
            </div>
            {r.requestedDate && <p className="text-muted-foreground">Requested date: {r.requestedDate}</p>}
            {r.message && <p className="text-muted-foreground">&ldquo;{r.message}&rdquo;</p>}
            {r.staffResponse && (
              <p className="rounded-md bg-secondary px-2 py-1.5 text-secondary-foreground">{r.staffResponse}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
