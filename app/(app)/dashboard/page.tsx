import { redirect } from 'next/navigation'
import { and, eq, gte, lte, inArray } from 'drizzle-orm'
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
import ServiceCard from '@/components/service-card'
import type { ServiceCardBoat, ServiceCardEmployee } from '@/components/service-card'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  // Use local date parts — toISOString() is UTC and rolls over to the next day
  // for users in negative-offset timezones (US/Pacific, etc.)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayYMD(): string {
  return toYMD(new Date())
}

function thisWeekBounds(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 6=Sat
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - day)
  sunday.setHours(0, 0, 0, 0)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)
  saturday.setHours(23, 59, 59, 999)
  return { start: toYMD(sunday), end: toYMD(saturday) }
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  recurring:          'Recurring',
  detailing:          'Detailing',
  buffing_waxing:     'Buff & Wax',
  acid_washing:       'Acid Wash',
  powerwashing:       'Power Wash',
  gelcoat_wetsanding: 'Gelcoat',
  captaining:         'Captaining',
  other:              'Other',
}

// ─── Data fetching ────────────────────────────────────────────────────────────

type ServiceData = {
  id: string
  serviceDate: string
  serviceType: string
  status: string
  notes: string | null
  totalPrice: string | null
  approvedAt: Date | null
  customerId: string
  customerName: string
  customerNotes: string | null
  boats: ServiceCardBoat[]
}

async function fetchServiceData(dateFilter: { start: string; end: string }): Promise<ServiceData[]> {
  // 1. Services + customers
  const serviceRows = await db
    .select({
      id:           services.id,
      serviceDate:  services.serviceDate,
      serviceType:  services.serviceType,
      status:       services.status,
      notes:        services.notes,
      totalPrice:   services.totalPrice,
      approvedAt:   services.approvedAt,
      customerId:   services.customerId,
      customerName: customers.name,
      customerNotes:customers.notes,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(and(gte(services.serviceDate, dateFilter.start), lte(services.serviceDate, dateFilter.end)))
    .orderBy(services.serviceDate, customers.name)

  if (serviceRows.length === 0) return []

  const serviceIds = serviceRows.map((s) => s.id)

  // 2. Boats per service
  const boatRows = await db
    .select({
      serviceId:  serviceBoats.serviceId,
      boatId:     serviceBoats.boatId,
      nickname:   boats.nickname,
      makeModel:  boats.makeModel,
      lengthFt:   boats.lengthFt,
      boatNotes:  boats.notes,
    })
    .from(serviceBoats)
    .innerJoin(boats, eq(boats.id, serviceBoats.boatId))
    .where(inArray(serviceBoats.serviceId, serviceIds))

  // 3. Per-boat assignments
  const assignmentRows = await db
    .select({
      serviceId: serviceBoatAssignments.serviceId,
      boatId:    serviceBoatAssignments.boatId,
      userId:    serviceBoatAssignments.userId,
    })
    .from(serviceBoatAssignments)
    .where(inArray(serviceBoatAssignments.serviceId, serviceIds))

  // Build assignments map: serviceId → boatId → userId[]
  const assignMap: Record<string, Record<string, string[]>> = {}
  for (const r of assignmentRows) {
    if (!assignMap[r.serviceId]) assignMap[r.serviceId] = {}
    if (!assignMap[r.serviceId][r.boatId]) assignMap[r.serviceId][r.boatId] = []
    assignMap[r.serviceId][r.boatId].push(r.userId)
  }

  // Build boats map: serviceId → ServiceCardBoat[]
  const boatsMap: Record<string, ServiceCardBoat[]> = {}
  for (const r of boatRows) {
    if (!boatsMap[r.serviceId]) boatsMap[r.serviceId] = []
    boatsMap[r.serviceId].push({
      boatId:     r.boatId,
      nickname:   r.nickname,
      makeModel:  r.makeModel,
      lengthFt:   r.lengthFt,
      boatNotes:  r.boatNotes,
      assignedIds: assignMap[r.serviceId]?.[r.boatId] ?? [],
    })
  }

  return serviceRows.map((s) => ({
    ...s,
    totalPrice:  s.totalPrice ?? null,
    approvedAt:  s.approvedAt ?? null,
    customerNotes: s.customerNotes ?? null,
    boats: boatsMap[s.id] ?? [],
  }))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = todayYMD()
  const { start: weekStart, end: weekEnd } = thisWeekBounds()

  const todayServices = await fetchServiceData({ start: today, end: today })
  let displayServices = todayServices
  let showingThisWeek = false

  if (todayServices.length === 0) {
    const weekServices = await fetchServiceData({ start: weekStart, end: weekEnd })
    displayServices = weekServices.filter((s) => s.serviceDate > today)
    showingThisWeek = true
  }

  // Build userNameMap from DB users
  let dbUsers: ServiceCardEmployee[] = []
  try {
    dbUsers = await db.select({ id: users.id, displayName: users.displayName }).from(users)
  } catch { /* non-fatal */ }

  const userNameMap: Record<string, string> = {}
  for (const u of dbUsers) userNameMap[u.id] = u.displayName

  const isManager = user.role === 'owner' || user.role === 'manager'

  const heading = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayServices.map((svc) => (
            <ServiceCard
              key={svc.id}
              serviceId={svc.id}
              customerId={svc.customerId}
              customerName={svc.customerName}
              customerNotes={svc.customerNotes}
              serviceType={svc.serviceType}
              serviceTypeLabel={SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType}
              serviceDate={svc.serviceDate}
              status={svc.status}
              notes={svc.notes}
              totalPrice={svc.totalPrice}
              approvedAt={svc.approvedAt}
              boats={svc.boats}
              userNameMap={userNameMap}
              canComplete={true}
              canManage={isManager}
            />
          ))}
        </div>
      )}
    </div>
  )
}
