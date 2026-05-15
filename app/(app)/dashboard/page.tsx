import { redirect } from 'next/navigation'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { services, customers, serviceBoats, boats, serviceAssignments, users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import JobCard, { type BoatLine, type JobCardProps } from './job-card'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0]
}

function todayYMD(): string {
  return toYMD(new Date())
}

/** Start and end of the current calendar week (Mon–Sun). */
function thisWeekBounds(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: toYMD(monday), end: toYMD(sunday) }
}

const SERVICE_LABELS: Record<string, string> = {
  recurring: 'Standard Clean',
  detailing: 'Detailing',
  buffing_waxing: 'Buffing & Waxing',
  acid_washing: 'Acid Washing',
  powerwashing: 'Powerwashing',
  gelcoat_wetsanding: 'Gelcoat Wet-Sanding',
  captaining: 'Captaining',
  other: 'Other',
}

// ─── Data fetching ────────────────────────────────────────────────────────────

type RawRow = {
  serviceId: string
  serviceDate: string
  serviceType: string
  status: string
  notes: string | null
  customerName: string
  customerAddress: string | null
  customerNotes: string | null
  boatId: string | null
  boatNickname: string | null
  boatMakeModel: string | null
  boatLengthFt: number | null
  boatNotes: string | null
  assignedUserId: string | null
  assignedUserName: string | null
}

async function fetchServices(dateFilter: { start: string; end: string }): Promise<RawRow[]> {
  const rows = await db
    .select({
      serviceId: services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      status: services.status,
      notes: services.notes,
      customerName: customers.name,
      customerAddress: customers.address,
      customerNotes: customers.notes,
      boatId: boats.id,
      boatNickname: boats.nickname,
      boatMakeModel: boats.makeModel,
      boatLengthFt: boats.lengthFt,
      boatNotes: boats.notes,
      assignedUserId: serviceAssignments.userId,
      assignedUserName: users.displayName,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .leftJoin(serviceBoats, eq(serviceBoats.serviceId, services.id))
    .leftJoin(boats, eq(boats.id, serviceBoats.boatId))
    .leftJoin(serviceAssignments, eq(serviceAssignments.serviceId, services.id))
    .leftJoin(users, eq(users.id, serviceAssignments.userId))
    .where(
      and(
        gte(services.serviceDate, dateFilter.start),
        lte(services.serviceDate, dateFilter.end)
      )
    )
    .orderBy(services.serviceDate, customers.name)

  return rows
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

type ServiceData = {
  id: string
  serviceDate: string
  serviceType: string
  status: string
  notes: string | null
  customerName: string
  customerAddress: string | null
  customerNotes: string | null
  boats: BoatLine[]
  assignedUsers: { id: string; name: string }[]
}

function groupRows(rows: RawRow[]): ServiceData[] {
  const serviceMap = new Map<string, ServiceData>()

  for (const r of rows) {
    if (!serviceMap.has(r.serviceId)) {
      serviceMap.set(r.serviceId, {
        id: r.serviceId,
        serviceDate: r.serviceDate,
        serviceType: r.serviceType,
        status: r.status,
        notes: r.notes,
        customerName: r.customerName,
        customerAddress: r.customerAddress,
        customerNotes: r.customerNotes,
        boats: [],
        assignedUsers: [],
      })
    }

    const svc = serviceMap.get(r.serviceId)!

    if (r.boatId && !svc.boats.find((b) => b.boatId === r.boatId)) {
      svc.boats.push({
        boatId: r.boatId,
        nickname: r.boatNickname ?? '',
        makeModel: r.boatMakeModel,
        lengthFt: r.boatLengthFt,
        boatNotes: r.boatNotes,
      })
    }

    if (r.assignedUserId && !svc.assignedUsers.find((u) => u.id === r.assignedUserId)) {
      svc.assignedUsers.push({ id: r.assignedUserId, name: r.assignedUserName ?? '' })
    }
  }

  return Array.from(serviceMap.values())
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const today = todayYMD()
  const { start: weekStart, end: weekEnd } = thisWeekBounds()

  const todayRows = await fetchServices({ start: today, end: today })
  const todayServices = groupRows(todayRows)

  let weekServices: ServiceData[] = []
  let showingThisWeek = false

  if (todayServices.length === 0) {
    const weekRows = await fetchServices({ start: weekStart, end: weekEnd })
    weekServices = groupRows(weekRows).filter((s) => s.serviceDate > today)
    showingThisWeek = true
  }

  const displayServices = showingThisWeek ? weekServices : todayServices

  const isOwnerOrManager = user.role === 'owner' || user.role === 'manager'

  const heading = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const subheading = showingThisWeek
    ? "No jobs today — showing this week's upcoming services"
    : user.role === 'employee'
    ? 'Your jobs for today'
    : 'All jobs today'

  function toCardProps(svc: ServiceData): JobCardProps {
    return {
      serviceId: svc.id,
      serviceType: svc.serviceType,
      serviceTypeLabel: SERVICE_LABELS[svc.serviceType] ?? svc.serviceType,
      status: svc.status,
      serviceDate: svc.serviceDate,
      notes: svc.notes,
      customerName: svc.customerName,
      customerAddress: svc.customerAddress,
      customerNotes: svc.customerNotes,
      boats: svc.boats,
      canComplete: true,
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">{heading}</h1>
      <p className="text-muted-foreground mb-6">{subheading}</p>

      {displayServices.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {showingThisWeek ? 'No services scheduled this week.' : 'No jobs scheduled for today.'}
        </div>
      ) : isOwnerOrManager ? (
        <OwnerManagerView services={displayServices} toCardProps={toCardProps} />
      ) : (
        <div className="space-y-4">
          {displayServices.map((svc) => (
            <JobCard key={svc.id} {...toCardProps(svc)} />
          ))}
        </div>
      )}
    </div>
  )
}

function OwnerManagerView({
  services: svcs,
  toCardProps,
}: {
  services: ServiceData[]
  toCardProps: (svc: ServiceData) => JobCardProps
}) {
  const groups = new Map<string, ServiceData[]>()

  for (const svc of svcs) {
    if (svc.assignedUsers.length === 0) {
      const key = 'Unassigned'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(svc)
    } else {
      for (const u of svc.assignedUsers) {
        const key = u.name
        if (!groups.has(key)) groups.set(key, [])
        if (!groups.get(key)!.find((s) => s.id === svc.id)) {
          groups.get(key)!.push(svc)
        }
      }
    }
  }

  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([assignee, assigneeSvcs]) => (
        <div key={assignee}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {assignee}
          </h2>
          <div className="space-y-4">
            {assigneeSvcs.map((svc) => (
              <JobCard key={svc.id} {...toCardProps(svc)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
