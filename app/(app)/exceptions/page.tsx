import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, Clock3, CloudRain, DollarSign, FileWarning, MessageSquareWarning, ReceiptText, RefreshCw, UserX } from 'lucide-react'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  boats,
  complaints,
  customerReminderContacts,
  customers,
  invoices,
  serviceBoatAssignments,
  serviceBoats,
  services,
  timeEntries,
  users,
} from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { todayET } from '@/lib/date'

export const dynamic = 'force-dynamic'

type Icon = React.ComponentType<{ className?: string }>
type NextFetchOptions = RequestInit & {
  next?: { revalidate?: number }
}

const SERVICE_LABELS: Record<string, string> = {
  recurring: 'Recurring Clean',
  detailing: 'Detailing',
  buffing_waxing: 'Buff & Wax',
  acid_washing: 'Acid Wash',
  powerwashing: 'Power Wash',
  gelcoat_wetsanding: 'Gelcoat',
  captaining: 'Captaining',
  other: 'Other',
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T12:00:00')
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  })
}

function serviceLabel(type: string): string {
  return SERVICE_LABELS[type] ?? type.replace(/_/g, ' ')
}

function money(value: string | null): string {
  if (value == null) return 'No amount'
  return `$${Number(value).toFixed(2)}`
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </Link>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function Section({
  title,
  description,
  count,
  icon: Icon,
  tone = 'default',
  children,
}: {
  title: string
  description: string
  count: number
  icon: Icon
  tone?: 'default' | 'warning' | 'danger'
  children: React.ReactNode
}) {
  return (
    <Card className={cn(
      count > 0 && tone === 'danger' && 'border-red-200',
      count > 0 && tone === 'warning' && 'border-amber-200'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className={cn(
              'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
              tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' :
              tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' :
              'border-border bg-muted text-muted-foreground'
            )}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge variant={count > 0 ? (tone === 'danger' ? 'destructive' : 'warning') : 'secondary'}>
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Row({
  title,
  meta,
  detail,
  badge,
  href,
  action,
}: {
  title: string
  meta: string
  detail?: string
  badge?: React.ReactNode
  href: string
  action: string
}) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href} className="font-medium text-sm hover:underline">
            {title}
          </Link>
          {badge}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
        {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      </div>
      <div className="shrink-0">
        <ActionLink href={href}>{action}</ActionLink>
      </div>
    </div>
  )
}

async function fetchWeatherRiskJobs(today: string) {
  const weatherLat = process.env.WEATHER_LAT
  const weatherLng = process.env.WEATHER_LNG
  if (!weatherLat || !weatherLng) return []

  const end = addDays(today, 7)
  const weatherByDay: Record<string, { tempMaxF: number; precipPct: number; windMph: number }> = {}

  try {
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${weatherLat}&longitude=${weatherLng}` +
      `&daily=temperature_2m_max,precipitation_probability_max,windspeed_10m_max` +
      `&temperature_unit=fahrenheit` +
      `&wind_speed_unit=mph` +
      `&timezone=America%2FChicago` +
      `&start_date=${today}&end_date=${end}`
    const weatherFetchOptions: NextFetchOptions = { next: { revalidate: 3600 } }
    const res = await fetch(weatherUrl, weatherFetchOptions)
    if (!res.ok) return []
    const data = await res.json() as {
      daily: {
        time: string[]
        temperature_2m_max: (number | null)[]
        precipitation_probability_max: (number | null)[]
        windspeed_10m_max: (number | null)[]
      }
    }
    for (let i = 0; i < data.daily.time.length; i++) {
      weatherByDay[data.daily.time[i]] = {
        tempMaxF: Math.round(data.daily.temperature_2m_max[i] ?? 0),
        precipPct: Math.round(data.daily.precipitation_probability_max[i] ?? 0),
        windMph: Math.round(data.daily.windspeed_10m_max[i] ?? 0),
      }
    }
  } catch {
    return []
  }

  const rows = await db
    .select({
      id: services.id,
      serviceDate: services.serviceDate,
      serviceType: services.serviceType,
      customerName: customers.name,
      customerAddress: customers.address,
    })
    .from(services)
    .innerJoin(customers, eq(services.customerId, customers.id))
    .where(and(
      eq(services.status, 'scheduled'),
      isNotNull(services.approvedAt),
      gte(services.serviceDate, today),
      lte(services.serviceDate, end)
    ))
    .orderBy(asc(services.serviceDate), asc(customers.name))

  return rows
    .map((row) => ({ ...row, weather: weatherByDay[row.serviceDate] }))
    .filter((row) => row.weather && (row.weather.precipPct >= 60 || row.weather.windMph >= 20))
}

export default async function ExceptionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'owner' && user.role !== 'manager') redirect('/dashboard')

  const today = todayET()

  const [
    unassignedBoats,
    completedWithoutInvoices,
    staleQboInvoices,
    missingReminderContacts,
    overdueInvoices,
    openComplaints,
    openClockEntries,
    servicesWithoutPrice,
    weatherRiskJobs,
  ] = await Promise.all([
    db
      .select({
        serviceId: services.id,
        serviceDate: services.serviceDate,
        serviceType: services.serviceType,
        customerName: customers.name,
        boatName: boats.nickname,
      })
      .from(serviceBoats)
      .innerJoin(services, eq(serviceBoats.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
      .leftJoin(
        serviceBoatAssignments,
        and(
          eq(serviceBoatAssignments.serviceId, serviceBoats.serviceId),
          eq(serviceBoatAssignments.boatId, serviceBoats.boatId)
        )
      )
      .where(and(
        eq(services.status, 'scheduled'),
        gte(services.serviceDate, today),
        isNull(serviceBoatAssignments.userId)
      ))
      .orderBy(asc(services.serviceDate), asc(customers.name), asc(boats.nickname)),

    db
      .select({
        serviceId: services.id,
        serviceDate: services.serviceDate,
        serviceType: services.serviceType,
        totalPrice: services.totalPrice,
        customerName: customers.name,
      })
      .from(services)
      .innerJoin(customers, eq(services.customerId, customers.id))
      .leftJoin(invoices, eq(invoices.serviceId, services.id))
      .where(and(
        eq(services.status, 'complete'),
        eq(customers.isPrepaid, false),
        isNull(invoices.id)
      ))
      .orderBy(desc(services.serviceDate), asc(customers.name)),

    db
      .select({
        invoiceId: invoices.id,
        serviceId: services.id,
        serviceDate: services.serviceDate,
        amount: invoices.amount,
        status: invoices.status,
        customerName: customers.name,
      })
      .from(invoices)
      .innerJoin(services, eq(invoices.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .where(eq(invoices.qboNeedsSync, true))
      .orderBy(desc(invoices.createdAt)),

    db
      .select({
        serviceId: services.id,
        serviceDate: services.serviceDate,
        serviceType: services.serviceType,
        customerId: customers.id,
        customerName: customers.name,
      })
      .from(services)
      .innerJoin(customers, eq(services.customerId, customers.id))
      .leftJoin(customerReminderContacts, eq(customerReminderContacts.customerId, customers.id))
      .where(and(
        eq(services.status, 'scheduled'),
        gte(services.serviceDate, today),
        isNotNull(services.approvedAt),
        eq(services.reminderSuppressed, false),
        isNull(customerReminderContacts.id)
      ))
      .orderBy(asc(services.serviceDate), asc(customers.name)),

    db
      .select({
        invoiceId: invoices.id,
        serviceId: services.id,
        serviceDate: services.serviceDate,
        amount: invoices.amount,
        customerName: customers.name,
      })
      .from(invoices)
      .innerJoin(services, eq(invoices.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .where(eq(invoices.status, 'overdue'))
      .orderBy(asc(services.serviceDate), asc(customers.name)),

    db
      .select({
        id: complaints.id,
        serviceId: services.id,
        serviceDate: services.serviceDate,
        customerId: customers.id,
        customerName: customers.name,
        severity: complaints.severity,
        description: complaints.description,
        createdAt: complaints.createdAt,
      })
      .from(complaints)
      .innerJoin(services, eq(complaints.serviceId, services.id))
      .innerJoin(customers, eq(complaints.customerId, customers.id))
      .where(eq(complaints.resolved, false))
      .orderBy(desc(complaints.createdAt)),

    db
      .select({
        id: timeEntries.id,
        userId: users.id,
        serviceId: services.id,
        serviceDate: services.serviceDate,
        customerName: customers.name,
        employeeName: users.displayName,
        boatName: boats.nickname,
        clockIn: timeEntries.clockIn,
      })
      .from(timeEntries)
      .innerJoin(users, eq(timeEntries.userId, users.id))
      .leftJoin(services, eq(timeEntries.serviceId, services.id))
      .leftJoin(customers, eq(services.customerId, customers.id))
      .leftJoin(boats, eq(timeEntries.boatId, boats.id))
      .where(isNull(timeEntries.clockOut))
      .orderBy(asc(timeEntries.clockIn)),

    db
      .select({
        serviceId: services.id,
        serviceDate: services.serviceDate,
        serviceType: services.serviceType,
        status: services.status,
        totalPrice: services.totalPrice,
        customerName: customers.name,
        boatName: boats.nickname,
        rate: serviceBoats.rate,
      })
      .from(serviceBoats)
      .innerJoin(services, eq(serviceBoats.serviceId, services.id))
      .innerJoin(customers, eq(services.customerId, customers.id))
      .innerJoin(boats, eq(serviceBoats.boatId, boats.id))
      .where(and(
        inArray(services.status, ['scheduled', 'complete']),
        or(eq(services.status, 'complete'), gte(services.serviceDate, today)),
        or(isNull(services.totalPrice), isNull(serviceBoats.rate))
      ))
      .orderBy(asc(services.serviceDate), asc(customers.name), asc(boats.nickname)),

    fetchWeatherRiskJobs(today),
  ])

  const totalExceptions =
    unassignedBoats.length +
    completedWithoutInvoices.length +
    staleQboInvoices.length +
    missingReminderContacts.length +
    overdueInvoices.length +
    openComplaints.length +
    openClockEntries.length +
    servicesWithoutPrice.length +
    weatherRiskJobs.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Exceptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manager attention queue for operational, billing, payroll, and reminder issues.
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open exceptions</p>
          <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums', totalExceptions > 0 ? 'text-foreground' : 'text-green-700')}>
            {totalExceptions}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Unassigned Boats"
          description="Upcoming scheduled boat lines without an assigned employee."
          count={unassignedBoats.length}
          icon={UserX}
          tone="warning"
        >
          {unassignedBoats.length === 0 ? <EmptyState>All upcoming boat lines are assigned.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {unassignedBoats.map((row) => (
                <Row
                  key={`${row.serviceId}-${row.boatName}`}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · ${serviceLabel(row.serviceType)}`}
                  detail={`Boat: ${row.boatName}`}
                  href={`/schedule/${row.serviceId}`}
                  action="Assign"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Completed Without Invoice"
          description="Completed non-prepaid services that have no invoice row."
          count={completedWithoutInvoices.length}
          icon={ReceiptText}
          tone="danger"
        >
          {completedWithoutInvoices.length === 0 ? <EmptyState>Every completed billable service has an invoice.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {completedWithoutInvoices.map((row) => (
                <Row
                  key={row.serviceId}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · ${serviceLabel(row.serviceType)}`}
                  detail={`Service total: ${money(row.totalPrice)}`}
                  href={`/schedule/${row.serviceId}`}
                  action="Generate"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Stale QBO Sync"
          description="Invoices marked as changed locally and needing QuickBooks sync."
          count={staleQboInvoices.length}
          icon={RefreshCw}
          tone="warning"
        >
          {staleQboInvoices.length === 0 ? <EmptyState>QuickBooks invoices are up to date.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {staleQboInvoices.map((row) => (
                <Row
                  key={row.invoiceId}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · ${money(row.amount)} · ${row.status}`}
                  href={`/schedule/${row.serviceId}`}
                  action="Review"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Missing Reminder Contact"
          description="Approved upcoming services whose customer has no reminder contact."
          count={missingReminderContacts.length}
          icon={MessageSquareWarning}
          tone="warning"
        >
          {missingReminderContacts.length === 0 ? <EmptyState>Approved upcoming services have reminder contacts.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {missingReminderContacts.map((row) => (
                <Row
                  key={row.serviceId}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · ${serviceLabel(row.serviceType)}`}
                  detail="Add a voice/SMS email or suppress the reminder."
                  href={`/customers/${row.customerId}`}
                  action="Add contact"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Overdue Invoices"
          description="Invoices currently marked overdue."
          count={overdueInvoices.length}
          icon={DollarSign}
          tone="danger"
        >
          {overdueInvoices.length === 0 ? <EmptyState>No overdue invoices.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {overdueInvoices.map((row) => (
                <Row
                  key={row.invoiceId}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · ${money(row.amount)}`}
                  href={`/schedule/${row.serviceId}`}
                  action="Open"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Open Complaints"
          description="Customer complaints that have not been resolved."
          count={openComplaints.length}
          icon={FileWarning}
          tone="danger"
        >
          {openComplaints.length === 0 ? <EmptyState>No unresolved complaints.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {openComplaints.map((row) => (
                <Row
                  key={row.id}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · opened ${fmtDateTime(row.createdAt)}`}
                  detail={row.description}
                  badge={
                    <Badge variant={row.severity === 'major' ? 'destructive' : 'warning'}>
                      {row.severity}
                    </Badge>
                  }
                  href="/complaints?filter=open"
                  action="Resolve"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Open Clock Entries"
          description="Employees currently clocked in without a clock-out."
          count={openClockEntries.length}
          icon={Clock3}
          tone="warning"
        >
          {openClockEntries.length === 0 ? <EmptyState>No one is stuck clocked in.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {openClockEntries.map((row) => (
                <Row
                  key={row.id}
                  title={row.employeeName}
                  meta={`Clocked in ${fmtDateTime(row.clockIn)}`}
                  detail={`${row.customerName ?? 'Unknown service'}${row.boatName ? ` · ${row.boatName}` : ''}`}
                  href={`/time?userId=${row.userId}`}
                  action="Review time"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Service Without Price"
          description="Scheduled or completed services missing a total or boat rate."
          count={servicesWithoutPrice.length}
          icon={AlertTriangle}
          tone="danger"
        >
          {servicesWithoutPrice.length === 0 ? <EmptyState>All active services have prices.</EmptyState> : (
            <div className="overflow-hidden rounded-md border">
              {servicesWithoutPrice.map((row) => (
                <Row
                  key={`${row.serviceId}-${row.boatName}`}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · ${serviceLabel(row.serviceType)} · ${row.status}`}
                  detail={`${row.totalPrice == null ? 'Missing service total' : `Service total ${money(row.totalPrice)}`}${row.rate == null ? ` · ${row.boatName} missing rate` : ''}`}
                  href={`/schedule/${row.serviceId}`}
                  action="Price"
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Weather-Risk Jobs"
          description="Approved jobs in the next 7 days with high rain chance or wind."
          count={weatherRiskJobs.length}
          icon={CloudRain}
          tone="warning"
        >
          {!process.env.WEATHER_LAT || !process.env.WEATHER_LNG ? (
            <EmptyState>Set WEATHER_LAT and WEATHER_LNG to enable weather-risk exceptions.</EmptyState>
          ) : weatherRiskJobs.length === 0 ? (
            <EmptyState>No approved jobs are currently flagged by the weather forecast.</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-md border">
              {weatherRiskJobs.map((row) => (
                <Row
                  key={row.id}
                  title={row.customerName}
                  meta={`${fmtDate(row.serviceDate)} · ${serviceLabel(row.serviceType)}`}
                  detail={`${row.weather!.precipPct}% rain · ${row.weather!.windMph} mph wind${row.customerAddress ? ` · ${row.customerAddress}` : ''}`}
                  badge={<Badge variant="warning">Weather</Badge>}
                  href={`/schedule/${row.id}`}
                  action="Review"
                />
              ))}
            </div>
          )}
        </Section>

      </div>
    </div>
  )
}
