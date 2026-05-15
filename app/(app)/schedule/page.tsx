import { db } from '@/lib/db'
import { services, customers, serviceBoats, boats, serviceBoatAssignments } from '@/lib/db/schema'
import { and, gte, lte, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { approveWeek, deleteService } from './actions'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function weekBounds(offsetWeeks: number): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7) + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function toYMD(d: Date) {
  return d.toISOString().split('T')[0]
}

function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDay(d: Date) {
  return `${DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

function fmtWeekRange(start: Date, end: Date) {
  return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  complete:  'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

const SERVICE_LABELS: Record<string, string> = {
  recurring:         'Standard Clean',
  detailing:         'Detailing',
  buffing_waxing:    'Buffing & Waxing',
  acid_washing:      'Acid Washing',
  powerwashing:      'Powerwashing',
  gelcoat_wetsanding:'Gelcoat Wet-Sanding',
  captaining:        'Captaining',
  other:             'Other',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const offset = parseInt(week ?? '0', 10) || 0
  const { start, end } = weekBounds(offset)
  const days = weekDays(start)
  const startYMD = toYMD(start)
  const endYMD = toYMD(end)

  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const devUser = DEV_USERS.find((u) => u.id === devUserId)
  const canManage = devUser?.role === 'owner' || devUser?.role === 'manager'

  // Fetch services + boats + assignments in the week
  const rows = await db
    .select({
      serviceId:    services.id,
      serviceDate:  services.serviceDate,
      serviceType:  services.serviceType,
      status:       services.status,
      totalPrice:   services.totalPrice,
      approvedAt:   services.approvedAt,
      approvedBy:   services.approvedByUserId,
      customerName: customers.name,
      boatId:       boats.id,
      boatNickname: boats.nickname,
      boatLength:   boats.lengthFt,
      sbDesc:       serviceBoats.description,
      sbNotes:      serviceBoats.notes,
      assignedUserId: serviceBoatAssignments.userId,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .leftJoin(serviceBoats, eq(serviceBoats.serviceId, services.id))
    .leftJoin(boats, eq(boats.id, serviceBoats.boatId))
    .leftJoin(
      serviceBoatAssignments,
      and(
        eq(serviceBoatAssignments.serviceId, services.id),
        eq(serviceBoatAssignments.boatId, boats.id)
      )
    )
    .where(and(gte(services.serviceDate, startYMD), lte(services.serviceDate, endYMD)))
    .orderBy(services.serviceDate, customers.name)

  // Build a lookup from dev user ID → displayName
  const userNames = Object.fromEntries(DEV_USERS.map((u) => [u.id, u.displayName]))

  // Group rows → services → days
  type BoatLine = {
    boatId: string
    nickname: string
    lengthFt: number | null
    description: string | null
    notes: string | null
    assignedNames: string[]
  }
  type ServiceCard = {
    id: string
    serviceDate: string
    serviceType: string
    status: string
    totalPrice: string | null
    customerName: string
    approvedAt: Date | null
    boats: BoatLine[]
  }

  const serviceMap = new Map<string, ServiceCard>()
  for (const r of rows) {
    if (!serviceMap.has(r.serviceId)) {
      serviceMap.set(r.serviceId, {
        id: r.serviceId,
        serviceDate: r.serviceDate,
        serviceType: r.serviceType,
        status: r.status,
        totalPrice: r.totalPrice,
        customerName: r.customerName,
        approvedAt: r.approvedAt,
        boats: [],
      })
    }
    if (r.boatId) {
      const svc = serviceMap.get(r.serviceId)!
      let boatLine = svc.boats.find((b) => b.boatId === r.boatId)
      if (!boatLine) {
        boatLine = {
          boatId: r.boatId,
          nickname: r.boatNickname!,
          lengthFt: r.boatLength ?? null,
          description: r.sbDesc ?? null,
          notes: r.sbNotes ?? null,
          assignedNames: [],
        }
        svc.boats.push(boatLine)
      }
      if (r.assignedUserId && !boatLine.assignedNames.includes(r.assignedUserId)) {
        boatLine.assignedNames.push(userNames[r.assignedUserId] ?? r.assignedUserId)
      }
    }
  }

  const byDay = new Map<string, ServiceCard[]>()
  for (const svc of Array.from(serviceMap.values())) {
    const key = svc.serviceDate
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(svc)
  }

  const todayYMD = toYMD(new Date())

  // Check if all scheduled services this week are already approved
  const allServices = Array.from(serviceMap.values())
  const scheduledServices = allServices.filter((s) => s.status === 'scheduled')
  const weekApproved = scheduledServices.length > 0 && scheduledServices.every((s) => s.approvedAt)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/schedule?week=${offset - 1}`}
            className="px-2 py-1 rounded-md border text-sm hover:bg-muted transition-colors"
          >
            ←
          </Link>
          <h1 className="text-xl font-semibold">{fmtWeekRange(start, end)}</h1>
          <Link
            href={`/schedule?week=${offset + 1}`}
            className="px-2 py-1 rounded-md border text-sm hover:bg-muted transition-colors"
          >
            →
          </Link>
          {offset !== 0 && (
            <Link href="/schedule" className="text-xs text-primary hover:underline ml-1">
              This week
            </Link>
          )}
        </div>

        {/* Approve Week button — manager+ only */}
        {canManage && scheduledServices.length > 0 && (
          weekApproved ? (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 font-medium">
              ✓ Week approved
            </span>
          ) : (
            <form action={approveWeek}>
              <input type="hidden" name="startDate" value={startYMD} />
              <input type="hidden" name="endDate" value={endYMD} />
              <button
                type="submit"
                className="text-sm font-medium px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Approve week
              </button>
            </form>
          )
        )}
      </div>

      {/* Week grid */}
      <div className="space-y-3">
        {days.map((day) => {
          const ymd = toYMD(day)
          const daySvcs = byDay.get(ymd) ?? []
          const isToday = ymd === todayYMD

          return (
            <div key={ymd} className={cn('rounded-lg border', isToday && 'border-primary/40')}>
              {/* Day header */}
              <div className={cn(
                'flex items-center justify-between px-4 py-2 rounded-t-lg',
                isToday ? 'bg-primary/10' : 'bg-muted/50'
              )}>
                <span className={cn('text-sm font-medium', isToday && 'text-primary')}>
                  {fmtDay(day)}
                  {isToday && <span className="ml-2 text-xs font-normal">Today</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {daySvcs.length === 0 ? 'No services' : `${daySvcs.length} service${daySvcs.length > 1 ? 's' : ''}`}
                </span>
              </div>

              {/* Service cards */}
              {daySvcs.length > 0 && (
                <div className="divide-y">
                  {daySvcs.map((svc) => (
                    <div key={svc.id} className="px-4 py-3 flex items-start justify-between gap-4">
                      <Link href={`/schedule/${svc.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{svc.customerName}</span>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full border',
                            STATUS_STYLES[svc.status] ?? STATUS_STYLES.scheduled
                          )}>
                            {svc.status}
                          </span>
                          {svc.approvedAt && (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700">
                              approved
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          {SERVICE_LABELS[svc.serviceType] ?? svc.serviceType}
                        </p>
                        {svc.boats.length > 0 && (
                          <div className="flex flex-col gap-1.5 mt-1.5">
                            {svc.boats.map((b) => (
                              <div key={b.boatId} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs bg-muted rounded px-2 py-0.5">
                                  {b.nickname}
                                  {b.lengthFt && <span className="text-muted-foreground ml-1">{b.lengthFt}ft</span>}
                                  {b.description && <span className="text-muted-foreground"> · {b.description}</span>}
                                </span>
                                {b.assignedNames.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    → {b.assignedNames.join(', ')}
                                  </span>
                                )}
                                {b.assignedNames.length === 0 && canManage && (
                                  <span className="text-xs text-amber-600">Unassigned</span>
                                )}
                                {b.notes && (
                                  <span className="text-xs italic text-muted-foreground">{b.notes}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        {svc.totalPrice && (
                          <span className="text-sm font-semibold tabular-nums">
                            ${Number(svc.totalPrice).toFixed(2)}
                          </span>
                        )}
                        {canManage && (
                          <ConfirmDeleteButton
                            action={deleteService.bind(null, svc.id, undefined)}
                            title="Delete service"
                            description={`Delete the service for ${svc.customerName} on ${fmtDay(new Date(svc.serviceDate + 'T00:00:00'))}? The associated invoice will also be deleted.`}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
