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
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { cn } from '@/lib/utils'
import { ApproveWeekModal, UnapproveWeekButton } from './approve-week-modal'
import ScheduleCard from './schedule-card'
import type { ReminderStatus } from './schedule-card'

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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ week?: string; employee?: string }>
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser()
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

  // ── Employee list (active DB users) ──────────────────────────────────────
  const employeeList = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName))

  // ── Employee filter pre-query ─────────────────────────────────────────────
  let filteredServiceIds: string[] | null = null
  if (selectedEmployee) {
    const rows = await db
      .select({ serviceId: serviceBoatAssignments.serviceId })
      .from(serviceBoatAssignments)
      .where(eq(serviceBoatAssignments.userId, selectedEmployee))
    const seen = new Set<string>()
    filteredServiceIds = rows.map((r) => r.serviceId).filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  // ── Services in week ──────────────────────────────────────────────────────
  const serviceRows = await db
    .select({
      id:           services.id,
      serviceDate:  services.serviceDate,
      serviceType:  services.serviceType,
      status:       services.status,
      totalPrice:     services.totalPrice,
      notes:          services.notes,
      approvedAt:     services.approvedAt,
      reminderSentAt: services.reminderSentAt,
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
    reminderSentAt: Date | null; customerId: string; customerName: string; boats: BoatEntry[]
  }

  const cards: ServiceCard[] = serviceRows.map((s) => ({
    ...s,
    totalPrice:     s.totalPrice ?? null,
    approvedAt:     s.approvedAt ?? null,
    reminderSentAt: s.reminderSentAt ?? null,
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 font-medium">
                ✓ Week approved
              </span>
              <UnapproveWeekButton startDate={weekStartStr} endDate={weekEndStr} />
            </div>
          ) : (
            <ApproveWeekModal
              startDate={weekStartStr}
              endDate={weekEndStr}
              scheduledServices={allScheduled.map((c) => ({
                id: c.id,
                serviceDate: c.serviceDate,
                customerName: c.customerName,
                boats: c.boats.map((b) => b.nickname),
              }))}
            />
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
                  {dayCards.map((card) => {
                    const todayStr = toISODate(new Date())
                    const reminderStatus: ReminderStatus = card.reminderSentAt
                      ? 'sent'
                      : card.status === 'scheduled' && card.approvedAt && card.serviceDate > todayStr
                        ? 'scheduled'
                        : 'none'
                    return (
                      <ScheduleCard
                        key={card.id}
                        serviceId={card.id}
                        customerId={card.customerId}
                        customerName={card.customerName}
                        serviceType={SERVICE_TYPE_LABELS[card.serviceType] ?? card.serviceType}
                        serviceDate={card.serviceDate}
                        status={card.status}
                        totalPrice={card.totalPrice}
                        notes={card.notes}
                        approvedAt={card.approvedAt}
                        reminderStatus={reminderStatus}
                        reminderSentAt={card.reminderSentAt}
                        boats={card.boats}
                        employees={employeeList}
                        isManager={isManager}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
