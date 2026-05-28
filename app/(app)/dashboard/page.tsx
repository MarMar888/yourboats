import { redirect } from 'next/navigation'
import { and, eq, gte, lte, inArray, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  services,
  customers,
  serviceBoats,
  boats,
  serviceBoatAssignments,
  users,
} from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { ReminderStatus } from '@/app/(app)/schedule/schedule-card'
import { DashboardScheduleCards } from './dashboard-schedule-cards'
import { todayET } from '@/lib/date'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function thisWeekBounds(): { start: string; end: string } {
  const [y, m, d] = todayET().split('-').map(Number)
  const now = new Date(y, m - 1, d)
  const day = now.getDay()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - day)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)
  return { start: toYMD(sunday), end: toYMD(saturday) }
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  recurring:          'Recurring Clean',
  detailing:          'Detailing',
  buffing_waxing:     'Buff & Wax',
  acid_washing:       'Acid Wash',
  powerwashing:       'Power Wash',
  gelcoat_wetsanding: 'Gelcoat',
  captaining:         'Captaining',
  other:              'Other',
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchServiceData(dateFilter: { start: string; end: string }) {
  const serviceRows = await db
    .select({
      id:              services.id,
      serviceDate:     services.serviceDate,
      serviceType:     services.serviceType,
      status:          services.status,
      notes:           services.notes,
      totalPrice:         services.totalPrice,
      approvedAt:         services.approvedAt,
      reminderSentAt:     services.reminderSentAt,
      completionPhotoUrl: services.completionPhotoUrl,
      customerId:         services.customerId,
      customerName:       customers.name,
      customerNotes:      customers.notes,
      customerAddress:    customers.address,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(and(gte(services.serviceDate, dateFilter.start), lte(services.serviceDate, dateFilter.end)))
    .orderBy(services.serviceDate, customers.name)

  if (serviceRows.length === 0) return []

  const serviceIds = serviceRows.map((s) => s.id)

  const boatRows = await db
    .select({
      serviceId:        serviceBoats.serviceId,
      boatId:           serviceBoats.boatId,
      nickname:         boats.nickname,
      boatNotes:        boats.notes,
      serviceBoatNotes: serviceBoats.notes,
    })
    .from(serviceBoats)
    .innerJoin(boats, eq(boats.id, serviceBoats.boatId))
    .where(inArray(serviceBoats.serviceId, serviceIds))

  const assignmentRows = await db
    .select({
      serviceId: serviceBoatAssignments.serviceId,
      boatId:    serviceBoatAssignments.boatId,
      userId:    serviceBoatAssignments.userId,
    })
    .from(serviceBoatAssignments)
    .where(inArray(serviceBoatAssignments.serviceId, serviceIds))

  const assignments: Record<string, Record<string, string[]>> = {}
  for (const r of assignmentRows) {
    if (!assignments[r.serviceId]) assignments[r.serviceId] = {}
    if (!assignments[r.serviceId][r.boatId]) assignments[r.serviceId][r.boatId] = []
    assignments[r.serviceId][r.boatId].push(r.userId)
  }

  const boatsByService: Record<string, { boatId: string; nickname: string; boatNotes: string | null; serviceBoatNotes: string | null; assignedIds: string[] }[]> = {}
  for (const r of boatRows) {
    if (!boatsByService[r.serviceId]) boatsByService[r.serviceId] = []
    boatsByService[r.serviceId].push({
      boatId:           r.boatId,
      nickname:         r.nickname,
      boatNotes:        r.boatNotes ?? null,
      serviceBoatNotes: r.serviceBoatNotes ?? null,
      assignedIds:      assignments[r.serviceId]?.[r.boatId] ?? [],
    })
  }

  return serviceRows.map((s) => ({
    ...s,
    totalPrice:         s.totalPrice ?? null,
    approvedAt:         s.approvedAt ?? null,
    reminderSentAt:     s.reminderSentAt ?? null,
    completionPhotoUrl: s.completionPhotoUrl ?? null,
    customerNotes:      s.customerNotes ?? null,
    customerAddress:    s.customerAddress ?? null,
    boats:              boatsByService[s.id] ?? [],
  }))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = todayET()
  const { start: weekStart, end: weekEnd } = thisWeekBounds()

  const todayServices = await fetchServiceData({ start: today, end: today })
  let displayServices = todayServices
  let showingThisWeek = false

  if (todayServices.length === 0) {
    const weekServices = await fetchServiceData({ start: weekStart, end: weekEnd })
    displayServices = weekServices.filter((s) => s.serviceDate > today)
    showingThisWeek = true
  }

  const employeeList = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName))

  const isManager = user.role === 'owner' || user.role === 'manager'

  const heading = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
  })
  const subheading = showingThisWeek
    ? "No jobs today — showing this week's upcoming services"
    : user.role === 'employee'
    ? 'Your jobs for today'
    : 'All jobs today'

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">{heading}</h1>
      <p className="text-muted-foreground mb-6">{subheading}</p>

      {displayServices.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {showingThisWeek ? 'No services scheduled this week.' : 'No jobs scheduled for today.'}
        </div>
      ) : (
        <DashboardScheduleCards
          cards={displayServices.map((svc) => ({
            ...svc,
            serviceType: SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType,
            reminderStatus: (svc.reminderSentAt
              ? 'sent'
              : svc.status === 'scheduled' && svc.approvedAt && svc.serviceDate > today
                ? 'scheduled'
                : 'none') as ReminderStatus,
          }))}
          employees={employeeList}
          isManager={isManager}
        />
      )}
    </div>
  )
}
