import Link from 'next/link'
import {
  ShieldCheck,
  Users,
  UserCheck,
  Sparkles,
  MessageSquare,
  Zap,
  CheckCircle2,
  LogIn,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { DEMO_URL } from '@/lib/demo-mode'
import ServiceCard from '@/components/service-card'
import { IntegrationsMarquee } from '@/components/integrations-marquee'
import { InvoiceRow, type InvoiceRowData } from '@/app/(app)/invoices/invoice-row'
import { RequestInfoForm } from '@/components/request-info-form'

const PREVIEW_JOBS = [
  { customer: 'Karen Ostlund', type: 'Slip inspection', time: '8:30 AM', status: 'Scheduled' },
  { customer: 'Dave Halvorson', type: 'Haul-out', time: '10:00 AM', status: 'In progress' },
  { customer: 'Chris & Amy Delaney', type: 'Detailing', time: '1:15 PM', status: 'Complete' },
] as const

const STATUS_VARIANT: Record<(typeof PREVIEW_JOBS)[number]['status'], 'secondary' | 'default' | 'success'> = {
  Scheduled: 'secondary',
  'In progress': 'default',
  Complete: 'success',
}

const SLIPS = [
  { id: 'A12', status: 'occupied' },
  { id: 'A13', status: 'available' },
  { id: 'A14', status: 'occupied' },
  { id: 'A15', status: 'occupied' },
  { id: 'B08', status: 'maintenance' },
  { id: 'B09', status: 'occupied' },
  { id: 'B10', status: 'available' },
  { id: 'B11', status: 'occupied' },
  { id: 'C21', status: 'occupied' },
  { id: 'C22', status: 'available' },
  { id: 'C23', status: 'occupied' },
  { id: 'C24', status: 'occupied' },
] as const

const SLIP_STATUS_STYLE: Record<string, string> = {
  occupied: 'border-primary/30 bg-primary/10 text-primary',
  available: 'border-border bg-muted text-muted-foreground',
  maintenance: 'border-amber-200 bg-amber-50 text-amber-700',
}

const RESERVATIONS = [
  { boat: 'Second Wind', slip: 'A14', dates: 'Aug 22 – Aug 25', rate: '$45/night' },
  { boat: 'Reel Therapy', slip: 'B10', dates: 'Aug 23 (1 night)', rate: '$45/night' },
  { boat: 'Wake Me Up', slip: 'C22', dates: 'Seasonal, Sep 1 – May 31', rate: '$3,200/season' },
] as const

const WORK_ORDERS = [
  { boat: 'Loose Change', type: 'Haul-out & bottom paint', status: 'Scheduled', date: 'Aug 28' },
  { boat: 'Salty Paws', type: 'Engine service', status: 'In progress', date: 'Aug 24' },
  { boat: 'Knot Working', type: 'Winterization', status: 'Complete', date: 'Aug 12' },
] as const

const WORK_ORDER_STATUS_VARIANT: Record<(typeof WORK_ORDERS)[number]['status'], 'secondary' | 'default' | 'success'> = {
  Scheduled: 'secondary',
  'In progress': 'default',
  Complete: 'success',
}

const MORE_CAPABILITIES = [
  {
    label: 'Fuel dock',
    body: 'Track fuel sales per boat and reconcile against tank readings.',
  },
  {
    label: "Ship's store POS",
    body: 'Ring up retail sales and tie them back to the customer account.',
  },
  {
    label: 'Utility billing',
    body: 'Meter electric and water per slip and roll it into the season invoice.',
  },
] as const

const ROLES = [
  {
    name: 'Owner',
    Icon: ShieldCheck,
    body: 'Full financial visibility: AR, P&L, payroll, and employee management, plus every operational view.',
  },
  {
    name: 'Manager',
    Icon: Users,
    body: 'Runs the day: assigns jobs, approves completed work, and pushes invoices to QuickBooks.',
  },
  {
    name: 'Employee',
    Icon: UserCheck,
    body: 'Sees only their assigned jobs: customer notes, boat details, and a one-tap complete button.',
  },
] as const

// Not built yet — kept clearly separate from the live IntegrationsMarquee above
// and labeled "coming soon" so this never reads as an existing integration.
const COMING_SOON = ['Mailchimp', 'DocuSign', 'Square', 'Stripe'] as const

const SAMPLE_INVOICE: InvoiceRowData = {
  invoiceId: 'sample-invoice',
  qboInvoiceId: 'sample-qbo-1042',
  docNumber: 1042,
  amount: '145.00',
  notes: null,
  status: 'paid',
  sentAt: new Date('2026-08-15T16:00:00'),
  paidAt: new Date('2026-08-18T11:00:00'),
  serviceDate: '2026-08-14',
  serviceStatus: 'complete',
  serviceId: 'sample-service',
  customerName: 'Dave Halvorson',
  customerId: 'sample-customer',
  isPrepaid: false,
  canManage: false,
  qboEnv: 'production',
  lineItems: [
    {
      serviceId: 'sample-service',
      boatId: 'sample-boat',
      nickname: 'Salty Paws',
      lengthFt: 21,
      description: 'Interior, Exterior',
      rateType: 'per_ft',
      rate: '6.50',
    },
  ],
}

const PAYROLL_ROWS = [
  {
    customer: 'Karen Ostlund',
    date: 'Aug 17',
    type: 'Recurring wash',
    pay: '$51.25',
    approved: true,
    breakdown: 'Revenue $82.00 · 62.5% to crew = pool $51.25 · Your 100% of pool = $51.25',
  },
  {
    customer: 'Chris & Amy Delaney',
    date: 'Aug 19',
    type: 'Buffing & wax',
    pay: '$108.00',
    approved: false,
    breakdown: 'Revenue $320.00 · 60% to crew = pool $192.00 · 70% split − 2.5% tier = 67.5% = $108.00 + $12 tip',
  },
] as const

const PL_STATS = [
  { label: 'Projected revenue', value: '$18,420', sub: '12 weeks', color: '' },
  { label: 'Variable labor', value: '$10,980', sub: '59.6% of rev', color: 'text-amber-600' },
  { label: 'Salaried costs', value: '$2,400', sub: 'GM salary + bonus', color: 'text-amber-600' },
  { label: 'Projected profit', value: '$5,040', sub: '27.4% margin', color: 'text-green-700' },
] as const

const COMPLAINT = {
  customer: 'Dave Halvorson',
  date: 'Aug 14',
  severity: 'Minor' as const,
  description: 'Slight streaking on the windshield after the wash. Customer asked for a touch-up next visit.',
  resolved: true,
}

const REMINDER = {
  customer: 'Nancy Kowalski',
  email: 'nkowalski@icloud.com',
  boat: 'Wake Me Up',
  sends: 'Tomorrow evening',
}

const PORTAL_TILES = [
  { label: 'Open invoices', value: '2' },
  { label: 'Next service', value: 'Aug 26' },
  { label: 'Boats on file', value: '1' },
  { label: 'Saved payment', value: 'Visa ····4242' },
] as const

const REVENUE_BARS = [
  { label: 'Wk 1', pct: 38 },
  { label: 'Wk 2', pct: 52 },
  { label: 'Wk 3', pct: 47 },
  { label: 'Wk 4', pct: 68 },
  { label: 'Wk 5', pct: 61 },
  { label: 'Wk 6', pct: 84 },
  { label: 'Wk 7', pct: 73 },
  { label: 'Wk 8', pct: 100 },
] as const

export default async function LandingPage() {
  const user = await getCurrentUser()
  const primaryHref = user ? '/dashboard' : '/login'
  const primaryLabel = user ? 'Go to dashboard' : 'Sign in'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            Yourboats
          </span>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={DEMO_URL}>See a demo</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4">
        <section className="grid gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-8">
          <div className="max-w-xl animate-fade-up">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              Marina service operations
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              The Operating System for Marinas + Boat Detailers.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Yourboats replaces the spreadsheet-and-text-message shuffle with a single
              operations app.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={primaryHref}>{primaryLabel}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={DEMO_URL}>See a demo</Link>
              </Button>
            </div>
            <RequestInfoForm />
          </div>

          <div className="animate-fade-up [animation-delay:75ms]" aria-hidden="true">
            <div className="rounded-xl border border-border bg-muted/40 p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5 px-1">
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
              </div>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">Today, Aug 22</p>
                  <p className="text-xs text-muted-foreground">3 jobs</p>
                </div>
                <div className="divide-y divide-border">
                  {PREVIEW_JOBS.map((job) => (
                    <div key={job.customer} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{job.customer}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.type} · <span className="tabular-nums">{job.time}</span>
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANT[job.status]} className="shrink-0">
                        {job.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* ── Slip & berth management ──────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Slip &amp; berth management
              </h2>
              <p className="mt-3 text-muted-foreground">
                See every slip at a glance: who&apos;s in it, who&apos;s out, and what
                needs attention. Assign a boat to a slip in a click and the season&apos;s
                billing follows automatically.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4" aria-hidden="true">
              <div className="grid grid-cols-4 gap-2">
                {SLIPS.map((slip) => (
                  <div
                    key={slip.id}
                    className={`rounded-md border px-2 py-3 text-center text-xs font-semibold ${SLIP_STATUS_STYLE[slip.status]}`}
                  >
                    {slip.id}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-primary/30 bg-primary/10" />
                  Occupied
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-border bg-muted" />
                  Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-amber-200 bg-amber-50" />
                  Maintenance
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Transient & seasonal reservations ────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="lg:order-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Transient &amp; seasonal reservations
              </h2>
              <p className="mt-3 text-muted-foreground">
                Book a transient boat for the night or a seasonal tenant for the
                summer, same board either way. Rates, dates, and slip assignment in
                one place.
              </p>
            </div>
            <div
              className="lg:order-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm"
              aria-hidden="true"
            >
              {RESERVATIONS.map((r) => (
                <div key={r.boat} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium">{r.boat}</p>
                    <p className="text-xs text-muted-foreground">
                      Slip {r.slip} · {r.dates}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{r.rate}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Scheduling & job cards ─────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Scheduling &amp; job cards
              </h2>
              <p className="mt-3 text-muted-foreground">
                Recurring schedules generate every service through season end. Crews see
                only their assigned jobs, with customer notes and boat details right on
                the card.
              </p>
            </div>
            <div className="mx-auto w-full max-w-sm" aria-hidden="true">
              <ServiceCard
                serviceId="sample-service-1"
                customerId="sample-customer-1"
                customerName="Karen Ostlund"
                customerNotes="Gate code 4471. Prefers morning service."
                serviceType="recurring"
                serviceTypeLabel="Recurring wash"
                serviceDate="2026-08-22"
                status="scheduled"
                totalPrice="82.00"
                boats={[
                  { boatId: 'sample-boat-1', nickname: 'Second Wind', makeModel: 'Malibu Wakesetter 23 LSV', lengthFt: 23 },
                ]}
                canComplete={false}
                canManage={false}
              />
            </div>
          </div>
        </section>

        {/* ── Work orders & haul-outs ───────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="lg:order-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Work orders &amp; haul-outs
              </h2>
              <p className="mt-3 text-muted-foreground">
                Repairs, winterization, haul-outs. Yard work runs through the same
                job cards as everything else, so nothing falls through the cracks
                between the dock crew and the yard.
              </p>
            </div>
            <div
              className="lg:order-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm"
              aria-hidden="true"
            >
              {WORK_ORDERS.map((w) => (
                <div key={w.boat} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium">{w.boat}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.type} · {w.date}
                    </p>
                  </div>
                  <Badge variant={WORK_ORDER_STATUS_VARIANT[w.status]}>{w.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Invoicing ───────────────────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="lg:order-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Invoicing synced to QuickBooks
              </h2>
              <p className="mt-3 text-muted-foreground">
                Mark a job complete and it lands in the manager&apos;s ready-to-invoice
                queue. One click pushes the invoice to QuickBooks, no double entry.
              </p>
            </div>
            <div className="lg:order-1 overflow-hidden rounded-lg border border-border" aria-hidden="true">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Invoice #</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <InvoiceRow inv={SAMPLE_INVOICE} qboItemOptions={[]} />
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Payroll ─────────────────────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Payroll that runs itself
              </h2>
              <p className="mt-3 text-muted-foreground">
                Effective-dated pay rates and tiered commissions calculate pay
                automatically, per service, per pay period, retroactive-safe when rates
                change mid-season.
              </p>
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm" aria-hidden="true">
              {PAYROLL_ROWS.map((row) => (
                <div key={row.customer} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{row.customer}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.date} · {row.type}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{row.pay}</p>
                      <span
                        className={
                          row.approved
                            ? 'mt-1 inline-block rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700'
                            : 'mt-1 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700'
                        }
                      >
                        {row.approved ? '✓ Approved' : 'Draft'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{row.breakdown}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── AR, P&L, and season analytics ──────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="lg:order-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                AR, P&amp;L, and season analytics
              </h2>
              <p className="mt-3 text-muted-foreground">
                Live accounts-receivable stats, a profit &amp; loss overview, and
                season-over-season labor analytics. No exporting to a spreadsheet to see
                where things stand.
              </p>
            </div>
            <div className="lg:order-1 grid grid-cols-2 gap-4" aria-hidden="true">
              {PL_STATS.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-border bg-card px-4 py-4">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={`text-2xl font-semibold tabular-nums ${stat.color}`}>{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Time clock & complaints ─────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Time clock &amp; complaints
              </h2>
              <p className="mt-3 text-muted-foreground">
                Crew clocks in and out per job. Complaints get logged against the service
                and customer, tracked severity to resolution.
              </p>
            </div>
            <div className="space-y-4" aria-hidden="true">
              <div className="rounded-xl border border-border bg-card px-6 py-8 text-center">
                <div className="font-mono text-5xl font-semibold tracking-tight tabular-nums text-green-600">
                  2:14:08
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Clocked in to <span className="font-medium text-foreground">Reel Therapy</span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{COMPLAINT.customer}</span>
                      <span className="text-xs text-muted-foreground">{COMPLAINT.date}</span>
                      <span className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
                        {COMPLAINT.severity}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{COMPLAINT.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="success">Resolved</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Customer statements & reminders ────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="lg:order-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Customer statements &amp; reminders
              </h2>
              <p className="mt-3 text-muted-foreground">
                Send customer statements and automatic service reminders by email or
                text, with clickable links between every customer, boat, service, and
                invoice.
              </p>
            </div>
            <div className="mx-auto w-full max-w-sm lg:order-1" aria-hidden="true">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-tight">
                      {REMINDER.customer}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">Scheduled</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{REMINDER.email}</p>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Boats</p>
                    <Badge variant="outline" className="text-xs">{REMINDER.boat}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-xs text-muted-foreground">Sends:</span>
                    <span className="text-xs font-medium text-foreground">{REMINDER.sends}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ── More marina capabilities ─────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              And the rest of the marina
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The parts that don&apos;t fit neatly into a feature list still run
              through the same board.
            </p>
          </div>
          <div className="mt-6 grid gap-8 sm:grid-cols-3">
            {MORE_CAPABILITIES.map((cap) => (
              <div key={cap.label}>
                <p className="text-sm font-semibold text-primary">{cap.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{cap.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── AI assistant ─────────────────────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              AI assistant
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              An assistant that actually runs the marina
            </h2>
            <p className="mt-3 text-muted-foreground">
              Most AI features just answer questions. Yourboats&apos; assistant does the
              work. Give it a plain-English instruction and it moves boats, sends
              invoices, and runs payroll, for real, against your actual records.
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-foreground">
                  Talk to it, don&apos;t click through it
                </h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Tell it what you need in plain English from Claude or your AI assistant
                of choice. No new app to learn, no separate login.
              </p>
              <div
                className="mt-4 rounded-lg border border-border bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100"
                aria-hidden="true"
              >
                <p className="text-zinc-500">$ claude</p>
                <p className="mt-2">&gt; Move the Ostlund boat to slip B09 and send this month&apos;s dockage invoice.</p>
                <p className="mt-2 text-emerald-400">✓ assign_slip(boat: &quot;svc_9f2&quot;, slip: &quot;B09&quot;)</p>
                <p className="text-emerald-400">✓ send_invoice(invoice: &quot;inv_2a7&quot;) → QuickBooks</p>
                <p className="mt-2 text-zinc-400">Done. Karen Ostlund moved to B09, invoiced $145.00, synced to QuickBooks.</p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-foreground">
                  It takes action, not just chats
                </h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                The assistant is wired straight into your schedule, invoices, payroll,
                and customer records, so it can actually do the task, not just describe
                it.
              </p>
              <div className="mt-4 rounded-lg border border-border bg-card p-4">
                <ul className="space-y-2.5 text-sm">
                  {[
                    "Reassigned 3 boats on today's schedule",
                    'Sent 2 overdue invoices, synced to QuickBooks',
                    "Recomputed this week's payroll",
                    'Logged and resolved a customer complaint',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Customer portal (coming soon) ────────────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div>
              <Badge variant="secondary">Coming soon</Badge>
              <h2 className="mt-3 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
                <LogIn className="h-5 w-5 text-primary" aria-hidden="true" />
                Let customers handle their own account
              </h2>
              <p className="mt-3 text-muted-foreground">
                Customers get their own login to see their invoices, make a payment,
                and check when their boat is scheduled next, without calling the
                office. Staff still see everything; customers only see their own
                account.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card" aria-hidden="true">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Welcome, Karen Ostlund</p>
                <p className="text-xs text-muted-foreground">
                  Balance due: <span className="font-medium text-foreground">$145.00</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                {PORTAL_TILES.map((tile) => (
                  <div key={tile.label} className="rounded-md border border-border px-3 py-3">
                    <p className="text-xs text-muted-foreground">{tile.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{tile.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Reporting & analytics (coming soon) ──────────────────────────────── */}
        <section className="border-t border-border py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="lg:order-2">
              <Badge variant="secondary">Coming soon</Badge>
              <h2 className="mt-3 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
                <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
                Charts on top of the numbers you already have
              </h2>
              <p className="mt-3 text-muted-foreground">
                AR and P&amp;L already run live in yourboats. Coming soon: visual
                trend lines and week-over-week comparisons, so you can see the shape
                of the season at a glance, not just a table.
              </p>
            </div>
            <div className="lg:order-1 rounded-lg border border-border bg-card p-4" aria-hidden="true">
              <p className="text-xs font-medium text-muted-foreground">Revenue by week</p>
              <div className="mt-4 flex h-32 items-end gap-2">
                {REVENUE_BARS.map((bar) => (
                  <div
                    key={bar.label}
                    className="flex-1 rounded-t-sm bg-primary/80"
                    style={{ height: `${bar.pct}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                {REVENUE_BARS.map((bar) => (
                  <span key={bar.label} className="flex-1 text-center text-[10px] text-muted-foreground">
                    {bar.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Connects to what you already run
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Yourboats doesn&apos;t ask you to rip out your existing tools. It plugs into
              them, so billing, communication, and records all stay in sync.
            </p>
          </div>
          <IntegrationsMarquee />

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Also coming soon
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {COMING_SOON.map((name) => (
                <Badge key={name} variant="outline" className="px-3 py-1 text-sm text-muted-foreground">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Need something custom?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Every operation runs a little differently. If a connection or workflow
              you need isn&apos;t on the list above, we build custom integrations and
              setups on request. Just reach out.
            </p>
            <div className="mt-4">
              <Button asChild variant="outline">
                <a href="mailto:marley@squeakycleanboats.com">Get in touch</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Built for the whole team
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Everyone signs into the same board and sees exactly what their role
              needs, nothing more.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {ROLES.map((role) => (
              <Card key={role.name}>
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <role.Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">{role.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{role.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            See it running before you set anything up
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href={primaryHref}>{primaryLabel}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={DEMO_URL}>See a demo</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-2 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Questions? We&apos;re happy to help.</p>
          <a
            href="mailto:marley@squeakycleanboats.com"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            marley@squeakycleanboats.com
          </a>
        </div>
      </footer>
    </div>
  )
}
