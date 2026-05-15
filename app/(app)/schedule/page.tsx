import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import {
  users,
  services,
  serviceBoats,
  serviceBoatAssignments,
  boats,
  customers,
} from '@/lib/db/schema'
import { eq, asc, and, gte, lte, inArray } from 'drizzle-orm'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { approveWeek, deleteService } from './actions'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import AssignInline from './assign-inline'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function parseDateParam(param: string | undefined): Date {
  if (param) {
    const d = new Date(param + 'T00:00:00')
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  recurring:         'Recurring',
  detailing:         'Detailing',
  buffing_waxing:    'Buff & Wax',
  acid_washing:      'Acid Wash',
  powerwashing:      'Power Wash',
  gelcoat_wetsanding:'Gelcoat',
  captaining:        'Captaining',
  other:             'Other',
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary'> = {
  scheduled: 'secondary',
  complete:  'success',
  cancelled: 'destructive',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ week?: string; employee?: string }>
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const cookieStore = await cookies()
  const currentUser = DEV_USERS.find((u) => u.id === cookieStore.get(DEV_USER_COOKIE)?.value)
  if (!currentUser) redirect('/pick-user')

  const isManager = currentUser.role === 'owner' || currentUser.role === 'manager'

  const params = await searchParams
  const weekDate = parseDateParam(params.week)
  const weekStart = getWeekStart(weekDate)
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = toISODate(weekStart)
  const weekEndStr = toISODate(weekEnd)
  const prevWeekStr = toISODate(addDays(weekStart, -7))
  const nextWeekStr = toISODate(addDays(weekStart, 7))
  const selectedEmployee = params.employee ?? ''

  // ── Employee list (DB users → fallback to DEV_USERS) ──────────────────────
  let employeeList: { id: string; displayName: string }[]
  try {
    const dbUsers = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.displayName))
    employeeList = dbUsers.length > 0
      ? dbUsers
      : DEV_USERS.map((u) => ({ id: u.id, displayName: u.displayName }))
  } catch {
    employeeList = DEV_USERS.map((u) => ({ id: u.id, displayName: u.displayName }))
  }

  // Name lookup map (DEV_USERS + DB users both contribute)
  const userNameMap: Record<string, string> = Object.fromEntries(
    DEV_USERS.map((u) => [u.id, u.displayName])
  )
  for (const emp of employeeList) userNameMap[emp.id] = emp.displayName

  // ── Employee filter pre-query ─────────────────────────────────────────────
  let filteredServiceIds: string[] | null = null
  if (selectedEmployee) {
    const rows = await db
      .select({ serviceId: serviceBoatAssignments.serviceId })
      .from(serviceBoatAssignments)
      .where(eq(serviceBoatAssignments.userId, selectedEmployee))
    filteredServiceIds = [...new Set(rows.map((r) => r.serviceId))]
  }

  // ── Services in week ──────────────────────────────────────────────────────
  const serviceRows = await db
    .select({
      id:           services.id,
      serviceDate:  services.serviceDate,
      serviceType:  services.serviceType,
      status:       services.status,
      totalPrice:   services.totalPrice,
      notes:        services.notes,
      approvedAt:   services.approvedAt,
      customerId:   services.customerId,
      customerName: customers.name,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(
      filteredServiceIds !== null
        ? and(
            gte(services.serviceDate, weekStartStr),
            lte(services.serviceDate, weekEndStr),
            inArray(services.id, filteredServiceIds.length > 0 ? filteredServiceIds : ['__none__'])
          )
        : and(gte(services.serviceDate, weekStartStr), lte(services.serviceDate, weekEndStr))
    )
    .orderBy(asc(services.serviceDate))

  const serviceIds = serviceRows.map((s) => s.id)

  // ── Boats per service ─────────────────────────────────────────────────────
  const boatRows = serviceIds.length
    ? await db
        .select({
          serviceId: serviceBoats.serviceId,
          boatId:    serviceBoats.boatId,
          nickname:  boats.nickname,
        })
        .from(serviceBoats)
        .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
        .where(inArray(serviceBoats.serviceId, serviceIds))
    : []

  // ── Per-boat assignments ──────────────────────────────────────────────────
  // serviceBoatAssignments.userId is text — works with dev user IDs
  const assignmentRows = serviceIds.length
    ? await db
        .select({
          serviceId: serviceBoatAssignments.serviceId,
          boatId:    serviceBoatAssignments.boatId,
          userId:    serviceBoatAssignments.userId,
        })
        .from(serviceBoatAssignments)
        .where(inArray(serviceBoatAssignments.serviceId, serviceIds))
    : []

  // ── Build per-service boat+assignment data ────────────────────────────────
  // assignments[serviceId][boatId] = userId[]
  const assignments: Record<string, Record<string, string[]>> = {}
  for (const r of assignmentRows) {
    if (!assignments[r.serviceId]) assignments[r.serviceId] = {}
    if (!assignments[r.serviceId][r.boatId]) assignments[r.serviceId][r.boatId] = []
    assignments[r.serviceId][r.boatId].push(r.userId)
  }

  const boatsByService: Record<string, { boatId: string; nickname: string }[]> = {}
  for (const r of boatRows) {
    if (!boatsByService[r.serviceId]) boatsByService[r.serviceId] = []
    boatsByService[r.serviceId].push({ boatId: r.boatId, nickname: r.nickname })
  }

  type BoatEntry = { boatId: string; nickname: string; assignedIds: string[] }
  type ServiceCard = {
    id: string; serviceDate: string; serviceType: string; status: string
    totalPrice: string | null; notes: string | null; approvedAt: Date | null
    customerId: string; customerName: string; boats: BoatEntry[]
  }

  const cards: ServiceCard[] = serviceRows.map((s) => ({
    ...s,
    totalPrice: s.totalPrice ?? null,
    approvedAt: s.approvedAt ?? null,
    boats: (boatsByService[s.id] ?? []).map((b) => ({
      ...b,
      assignedIds: assignments[s.id]?.[b.boatId] ?? [],
    })),
  }))

  const byDay: Record<string, ServiceCard[]> = {}
  for (let i = 0; i < 7; i++) byDay[toISODate(addDays(weekStart, i))] = []
  for (const card of cards) {
    if (byDay[card.serviceDate]) byDay[card.serviceDate].push(card)
  }

  const allScheduled = cards.filter((c) => c.status === 'scheduled')
  const weekApproved = allScheduled.length > 0 && allScheduled.every((c) => c.approvedAt)

  function employeeFilterUrl(empId: string) {
    const p = new URLSearchParams()
    p.set('week', weekStartStr)
    if (empId) p.set('employee', empId)
    return `/schedule?${p.toString()}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        {isManager && allScheduled.length > 0 && (
          weekApproved ? (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 font-medium">
              ✓ Week approved
            </span>
          ) : (
            <form action={approveWeek}>
              <input type="hidden" name="startDate" value={weekStartStr} />
              <input type="hidden" name="endDate" value={weekEndStr} />
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

      {/* Employee filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Link href={employeeFilterUrl('')} className={cn(
          'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors',
          !selectedEmployee
            ? 'bg-primary text-primary-foreground border-transparent'
            : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'
        )}>
          All
        </Link>
        {employeeList.map((emp) => (
          <Link key={emp.id} href={employeeFilterUrl(emp.id)} className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors',
            selectedEmployee === emp.id
              ? 'bg-primary text-primary-foreground border-transparent'
              : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'
          )}>
            {emp.displayName}
          </Link>
        ))}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/schedule?week=${prevWeekStr}${selectedEmployee ? `&employee=${selectedEmployee}` : ''}`}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          ← Prev
        </Link>
        <span className="text-sm font-medium">
          {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {' – '}
          {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <Link
          href={`/schedule?week=${nextWeekStr}${selectedEmployee ? `&employee=${selectedEmployee}` : ''}`}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          Next →
        </Link>
      </div>

      {/* Days */}
      <div className="space-y-6">
        {Object.entries(byDay).map(([dateStr, dayCards]) => {
          const dayDate = new Date(dateStr + 'T00:00:00')
          const isToday = dateStr === toISODate(new Date())

          return (
            <div key={dateStr}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn(
                  'text-sm font-semibold uppercase tracking-wide',
                  isToday ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {DAY_LABELS[dayDate.getDay()]}
                </span>
                <span className={cn('text-sm font-medium', isToday ? 'text-primary' : 'text-foreground')}>
                  {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {dayCards.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({dayCards.length} {dayCards.length === 1 ? 'job' : 'jobs'})
                  </span>
                )}
              </div>

              {dayCards.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-card/50 py-4 px-4 text-sm text-muted-foreground">
                  No services
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dayCards.map((card) => (
                    <div
                      key={card.id}
                      className={cn(
                        'relative flex flex-col rounded-xl border bg-card shadow-sm p-4 gap-2',
                        card.approvedAt && 'border-green-200 bg-green-50/30'
                      )}
                    >
                      {/* Top row: customer name → detail link + delete */}
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/schedule/${card.id}`}
                          className="font-semibold text-base leading-tight hover:underline"
                        >
                          {card.customerName}
                        </Link>
                        {isManager && (
                          <ConfirmDeleteButton
                            action={deleteService.bind(null, card.id, undefined)}
                            title="Delete service"
                            description={`Delete the service for ${card.customerName}? The invoice will also be deleted.`}
                            triggerLabel="×"
                          />
                        )}
                      </div>

                      {/* Service type + status + approved */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground">
                          {SERVICE_TYPE_LABELS[card.serviceType] ?? card.serviceType}
                        </span>
                        <Badge variant={STATUS_VARIANT[card.status] ?? 'secondary'} className="capitalize text-xs">
                          {card.status}
                        </Badge>
                        {card.approvedAt && (
                          <span className="text-xs text-green-600 font-medium">✓</span>
                        )}
                      </div>

                      {/* Boats + per-boat assignments */}
                      {card.boats.length > 0 && (
                        <div className="space-y-0.5">
                          {card.boats.map((b) => (
                            <div key={b.boatId} className="text-sm">
                              <span className="font-medium">{b.nickname}</span>
                              {b.assignedIds.length > 0 && (
                                <span className="text-xs text-muted-foreground ml-1.5">
                                  — {b.assignedIds.map((id) => userNameMap[id] ?? id).join(', ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline assignment (manager+) */}
                      {isManager && (
                        <AssignInline
                          serviceId={card.id}
                          boats={card.boats}
                          employees={employeeList}
                        />
                      )}

                      {/* Price */}
                      {card.totalPrice && (
                        <div className="mt-auto pt-1 flex justify-end">
                          <span className="text-sm font-medium">
                            ${parseFloat(card.totalPrice).toFixed(2)}
                          </span>
                        </div>
                      )}
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
