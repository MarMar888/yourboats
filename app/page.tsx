import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser } from '@/lib/auth/get-current-user'

const FEATURED = {
  title: 'Scheduling & job cards',
  body: 'Recurring schedules generate every service through season end. Crews see only their assigned jobs, with customer notes and boat details right on the card.',
}

const FEATURES = [
  {
    title: 'Invoicing synced to QuickBooks',
    body: "Mark a job complete and it lands in the manager's ready-to-invoice queue. One click pushes the invoice to QuickBooks — no double entry.",
  },
  {
    title: 'Payroll that runs itself',
    body: 'Effective-dated pay rates and tiered commissions calculate pay automatically, per service, per pay period — retroactive-safe when rates change mid-season.',
  },
  {
    title: 'AR, P&L, and season analytics',
    body: 'Live accounts-receivable stats, a profit & loss overview, and season-over-season labor analytics — no exporting to a spreadsheet to see where things stand.',
  },
  {
    title: 'Time clock & complaints',
    body: 'Crew clocks in and out per job. Complaints get logged against the service and customer, tracked severity to resolution.',
  },
  {
    title: 'Customer statements & reminders',
    body: 'Send customer statements and automatic service reminders by email or text, with clickable links between every customer, boat, service, and invoice.',
  },
]

const INTEGRATIONS = ['QuickBooks Online', 'Gmail', 'Voice / SMS reminders', 'Photo uploads']

const PREVIEW_JOBS = [
  { customer: 'Karen Ostlund', type: 'Recurring wash', time: '8:30 AM', status: 'Scheduled' },
  { customer: 'Dave Halvorson', type: 'Detailing', time: '10:00 AM', status: 'In progress' },
  { customer: 'Chris & Amy Delaney', type: 'Buffing & wax', time: '1:15 PM', status: 'Complete' },
] as const

const STATUS_VARIANT: Record<(typeof PREVIEW_JOBS)[number]['status'], 'secondary' | 'default' | 'success'> = {
  Scheduled: 'secondary',
  'In progress': 'default',
  Complete: 'success',
}

const JOB_CARDS = [
  {
    customer: 'Susan Pelto',
    boat: 'Knot Working · MasterCraft X24',
    note: 'Prefers afternoon service.',
    status: 'Scheduled',
  },
  {
    customer: 'Rick & Jen Torgerson',
    boat: 'Reel Therapy · Chaparral 246 SSi',
    note: 'Dog on the dock — friendly but loud.',
    status: 'In progress',
  },
  {
    customer: 'Nancy Kowalski',
    boat: 'Wake Me Up · Nautique G23',
    note: 'Biweekly wash, gate code on file.',
    status: 'Complete',
  },
] as const

const CONTACT_EMAIL = 'marley@squeakycleanboats.com'

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
            yourboats
          </span>
          <Button asChild size="sm">
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4">
        <section className="grid gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-8">
          <div className="max-w-xl animate-fade-up">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Marine service operations
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Run your marina, detail shop, or service crew from one board.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              yourboats replaces the spreadsheet-and-text-message shuffle with a single
              operations app: recurring schedules that generate the season automatically,
              job cards for the crew, one-tap invoicing synced to QuickBooks, and payroll
              that runs itself.
            </p>
            <div className="mt-8">
              <Button asChild size="lg">
                <Link href={primaryHref}>{primaryLabel}</Link>
              </Button>
            </div>
          </div>

          <div
            className="animate-fade-up [animation-delay:75ms]"
            aria-hidden="true"
          >
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
        </section>

        <section className="pb-20">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Everything the crew and the office need
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="transition-transform duration-150 hover:-translate-y-0.5 sm:col-span-2">
              <CardHeader>
                <CardTitle>{FEATURED.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{FEATURED.body}</CardContent>
            </Card>
            {FEATURES.map((feature, i) => (
              <Card
                key={feature.title}
                className={`transition-transform duration-150 hover:-translate-y-0.5 ${
                  i === FEATURES.length - 1 ? 'sm:col-span-2 lg:col-span-3' : ''
                }`}
              >
                <CardHeader>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{feature.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Connects to what you already run
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              yourboats doesn&apos;t ask you to rip out your existing tools — it plugs into
              them, so billing, communication, and records all stay in sync.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {INTEGRATIONS.map((name) => (
              <Badge key={name} variant="outline" className="px-3 py-1 text-sm">
                {name}
              </Badge>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-primary">Owner</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Full financial visibility — AR, P&amp;L, payroll, and employee management —
                plus every operational view.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Manager</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Runs the day: assigns jobs, approves completed work, and pushes invoices to
                QuickBooks.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Employee</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sees only their assigned jobs — customer notes, boat details, and a
                one-tap complete button.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border py-16">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Job cards the crew actually sees
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything an employee needs for the stop — boat details, notes, and status,
              right on the card.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {JOB_CARDS.map((job) => (
              <Card key={job.customer}>
                <CardHeader>
                  <CardTitle className="text-base">{job.customer}</CardTitle>
                  <p className="text-xs text-muted-foreground">{job.boat}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{job.note}</p>
                  <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                </CardContent>
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
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-2 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Questions? We&apos;re happy to help.</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  )
}
