import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { services, customers, serviceBoats, boats } from '@/lib/db/schema'
import { eq, and, gte, isNull, isNotNull, asc, inArray } from 'drizzle-orm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function parseDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/** Given a serviceDate string like "2026-05-20", return "May 19 evening" */
function reminderSendsLabel(serviceDate: string): string {
  const d = new Date(serviceDate + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' evening'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RemindersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = toISODate(new Date())

  // Query all upcoming scheduled services that are approved, future, and haven't had a reminder sent
  const serviceRows = await db
    .select({
      id:           services.id,
      serviceDate:  services.serviceDate,
      status:       services.status,
      customerId:   services.customerId,
      customerName: customers.name,
      customerEmail: customers.email,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(
      and(
        eq(services.status, 'scheduled'),
        isNotNull(services.approvedAt),
        gte(services.serviceDate, today),
        isNull(services.reminderSentAt),
      )
    )
    .orderBy(asc(services.serviceDate))

  const serviceIds = serviceRows.map((s) => s.id)

  // Fetch boats for each service
  const boatRows = serviceIds.length
    ? await db
        .select({
          serviceId: serviceBoats.serviceId,
          nickname:  boats.nickname,
        })
        .from(serviceBoats)
        .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
        .where(inArray(serviceBoats.serviceId, serviceIds))
    : []

  const boatsByService: Record<string, string[]> = {}
  for (const r of boatRows) {
    if (!boatsByService[r.serviceId]) boatsByService[r.serviceId] = []
    boatsByService[r.serviceId].push(r.nickname)
  }

  // Group services by date
  const byDate: Record<string, typeof serviceRows> = {}
  for (const s of serviceRows) {
    if (!byDate[s.serviceDate]) byDate[s.serviceDate] = []
    byDate[s.serviceDate].push(s)
  }

  const dateGroups = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upcoming service reminders — sent to customers the evening before their service date.
        </p>
      </div>

      {dateGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">🔔</div>
          <h2 className="text-lg font-medium mb-1">No upcoming reminders</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            All approved services have already had reminders sent, or there are no approved
            future services scheduled yet.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {dateGroups.map(([dateStr, group]) => (
            <div key={dateStr}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {parseDateLabel(dateStr)}
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({group.length} {group.length === 1 ? 'reminder' : 'reminders'})
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((s) => {
                  const boatList = boatsByService[s.id] ?? []
                  return (
                    <Card key={s.id} className="border shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base font-semibold leading-tight">
                            {s.customerName}
                          </CardTitle>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            Scheduled
                          </Badge>
                        </div>
                        {s.customerEmail && (
                          <p className="text-xs text-muted-foreground">{s.customerEmail}</p>
                        )}
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        {boatList.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Boats</p>
                            <div className="flex flex-wrap gap-1">
                              {boatList.map((nickname) => (
                                <Badge key={nickname} variant="outline" className="text-xs">
                                  {nickname}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-xs text-muted-foreground">Sends:</span>
                          <span className="text-xs font-medium text-foreground">
                            {reminderSendsLabel(dateStr)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
