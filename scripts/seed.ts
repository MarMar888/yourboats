/**
 * Demo data seed — populates the isolated demo database with a realistic
 * boat-cleaning business so prospects can be given a tour without touching
 * real production/QuickBooks data.
 *
 * Run with:
 *   pnpm seed   (=> tsx --env-file=.env.local scripts/seed.ts)
 *
 * Safe to re-run: clears its own tables (in FK-safe order) before inserting,
 * so repeated runs never hit unique-constraint errors. This script is meant
 * to run ONLY against the isolated demo Neon database — never production —
 * but is written defensively regardless.
 *
 * Demo login accounts (see app/(auth)/login/actions.ts for the
 * `@squeakycleanboats.com` suffix convention):
 *   demo-owner@squeakycleanboats.com    (role: owner)
 *   demo-manager@squeakycleanboats.com  (role: manager)
 *   demo-employee@squeakycleanboats.com (role: employee, tier: mid)
 *
 * NOTE: this script only creates the `users` table rows (role/tier/display
 * name). It does NOT create real sign-in credentials — auth in this app is
 * handled by Neon Auth (see lib/auth/server.ts), which is a separate hosted
 * identity system keyed by email. To actually log in as these accounts on
 * the demo deployment, either (a) sign up for each email through the normal
 * Neon Auth flow (magic link / password) once against the demo project, so
 * Neon Auth's session email matches the row this script creates and
 * syncUser() links them, or (b) enable the passwordless dev-auth bypass
 * (NEXT_PUBLIC_DEV_AUTH=true, non-production Vercel env) for the demo
 * deployment, which sidesteps Neon Auth entirely via lib/dev-users.ts.
 */

import { db } from '@/lib/db'
import {
  users,
  customers,
  customerReminderContacts,
  boats,
  recurringSchedules,
  tierConfig,
  serviceTypeShares,
  services,
  serviceBoats,
  serviceAssignments,
  invoices,
  complaints,
} from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

// ─── Small helpers ──────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** YYYY-MM-DD for `today + offsetDays`, computed at noon UTC to dodge DST edge cases. */
function dateOffset(offsetDays: number): string {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return isoDate(d)
}

function timestampOffset(offsetDays: number, hour = 10): Date {
  const d = new Date()
  d.setUTCHours(hour, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randMoney(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

/**
 * All dates matching `targetDow` (0=Sun..6=Sat) within [startOffset, endOffset]
 * days of today, downsampled to every `freqWeeks`-th occurrence (1 = weekly,
 * 2 = biweekly). Mirrors how recurringSchedules.dayOfWeek/frequencyWeeks are
 * meant to be interpreted elsewhere in the app.
 */
function occurrencesForWeekday(
  targetDow: number,
  freqWeeks: number,
  startOffset: number,
  endOffset: number
): string[] {
  const matches: string[] = []
  for (let offset = startOffset; offset <= endOffset; offset++) {
    const d = new Date()
    d.setUTCHours(12, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() + offset)
    if (d.getUTCDay() === targetDow) matches.push(isoDate(d))
  }
  return matches.filter((_, idx) => idx % freqWeeks === 0)
}

const PAST_WINDOW_START = -41 // ~6 weeks back
const FUTURE_WINDOW_END = 10 // ~1.5 weeks ahead

// Established service types — kept in sync with SERVICE_TYPES in
// app/(app)/schedule/[id]/edit-service-form.tsx and FALLBACK_SERVICE_TYPES in
// app/(app)/schedule/new/service-form.tsx. Do not invent new ones here.
const SERVICE_TYPES = [
  'recurring',
  'detailing',
  'buffing_waxing',
  'acid_washing',
  'powerwashing',
  'gelcoat_wetsanding',
  'captaining',
  'other',
] as const
type ServiceType = (typeof SERVICE_TYPES)[number]

const ONE_OFF_SERVICE_TYPES: ServiceType[] = [
  'detailing',
  'buffing_waxing',
  'acid_washing',
  'powerwashing',
  'gelcoat_wetsanding',
  'captaining',
  'other',
]

const BOAT_SERVICES = ['Interior', 'Exterior', 'Cabin', 'Engine Bay', 'Canvas']

// service type -> pricing rule used to build serviceBoats + totalPrice
const RATE_RULES: Record<ServiceType, { rateType: 'per_ft' | 'flat'; rate: [number, number] }> = {
  recurring: { rateType: 'per_ft', rate: [3.25, 3.75] },
  detailing: { rateType: 'flat', rate: [250, 450] },
  buffing_waxing: { rateType: 'flat', rate: [300, 500] },
  acid_washing: { rateType: 'per_ft', rate: [5.5, 6.5] },
  powerwashing: { rateType: 'per_ft', rate: [2.25, 2.75] },
  gelcoat_wetsanding: { rateType: 'flat', rate: [600, 900] },
  captaining: { rateType: 'flat', rate: [150, 250] },
  other: { rateType: 'flat', rate: [100, 200] },
}

// ─── Static demo data ───────────────────────────────────────────────────────

type CustomerSeed = {
  name: string
  email: string
  phone: string
  address: string
  notes: string | null
  isPrepaid: boolean
  boats: { nickname: string; makeModel: string; lengthFt: number }[]
  recurring?: { serviceType: ServiceType; dow: number; freqWeeks: 1 | 2; price: number }
}

// Lake Minnetonka area, MN — matches the address placeholder convention used
// elsewhere in the app ("20350 Lakeview Ave, Excelsior MN 55331").
const CUSTOMER_SEEDS: CustomerSeed[] = [
  {
    name: 'Karen Ostlund',
    email: 'karen.ostlund@gmail.com',
    phone: '952-555-0142',
    address: '4820 Meadville St, Excelsior, MN 55331',
    notes: 'Gate code 4471. Prefers morning service.',
    isPrepaid: true,
    boats: [{ nickname: 'Second Wind', makeModel: 'Malibu Wakesetter 23 LSV', lengthFt: 23 }],
    recurring: { serviceType: 'recurring', dow: 1, freqWeeks: 1, price: 82 },
  },
  {
    name: 'Tom & Linda Brekke',
    email: 'tbrekke@comcast.net',
    phone: '952-555-0187',
    address: '100 Lake St E, Wayzata, MN 55391',
    notes: null,
    isPrepaid: false,
    boats: [{ nickname: 'Loose Change', makeModel: 'Sea Ray Sundancer 320', lengthFt: 32 }],
  },
  {
    name: 'Dave Halvorson',
    email: 'dave.halvorson@outlook.com',
    phone: '952-555-0213',
    address: '2350 Shoreline Dr, Mound, MN 55364',
    notes: 'Two boats on the same lift — bring the extra fender kit.',
    isPrepaid: true,
    boats: [
      { nickname: 'Salty Paws', makeModel: 'Bayliner VR6', lengthFt: 21 },
      { nickname: 'The Minnow', makeModel: 'Bennington 22 SVL Pontoon', lengthFt: 22 },
    ],
    recurring: { serviceType: 'recurring', dow: 3, freqWeeks: 2, price: 145 },
  },
  {
    name: 'Susan Pelto',
    email: 'susan.pelto@yahoo.com',
    phone: '952-555-0298',
    address: '1740 Ferndale Rd, Wayzata, MN 55391',
    notes: null,
    isPrepaid: false,
    boats: [{ nickname: 'Knot Working', makeModel: 'MasterCraft X24', lengthFt: 24 }],
  },
  {
    name: 'Rick & Jen Torgerson',
    email: 'torgersonfam@gmail.com',
    phone: '952-555-0334',
    address: '5600 Interlachen Blvd, Edina, MN 55436',
    notes: 'Dog on the dock — friendly but loud.',
    isPrepaid: false,
    boats: [{ nickname: 'Reel Therapy', makeModel: 'Chaparral 246 SSi', lengthFt: 25 }],
    recurring: { serviceType: 'recurring', dow: 4, freqWeeks: 1, price: 88 },
  },
  {
    name: 'Beth Anders',
    email: 'beth.anders@gmail.com',
    phone: '952-555-0356',
    address: '890 Bushaway Rd, Wayzata, MN 55391',
    notes: null,
    isPrepaid: true,
    boats: [{ nickname: 'Aqua Holic', makeModel: 'Cobalt R5', lengthFt: 22 }],
    recurring: { serviceType: 'recurring', dow: 5, freqWeeks: 1, price: 80 },
  },
  {
    name: 'Mike Sorenson',
    email: 'msorenson@sorensonlaw.com',
    phone: '952-555-0402',
    address: '3100 North Shore Dr, Orono, MN 55356',
    notes: 'Bills quarterly — check with office before invoicing.',
    isPrepaid: false,
    boats: [{ nickname: 'Pier Pressure', makeModel: 'Bennington 24 QXFB Pontoon', lengthFt: 24 }],
  },
  {
    name: 'Nancy Kowalski',
    email: 'nkowalski@icloud.com',
    phone: '952-555-0421',
    address: '175 Grand Ave S, Spring Park, MN 55384',
    notes: null,
    isPrepaid: false,
    boats: [{ nickname: 'Wake Me Up', makeModel: 'Nautique G23', lengthFt: 23 }],
    recurring: { serviceType: 'recurring', dow: 6, freqWeeks: 2, price: 84 },
  },
  {
    name: 'Chris & Amy Delaney',
    email: 'delaneyfamily@gmail.com',
    phone: '952-555-0467',
    address: '4200 Manitou Rd, Tonka Bay, MN 55331',
    notes: 'Big boat — allow extra time.',
    isPrepaid: true,
    boats: [{ nickname: 'Vitamin Sea', makeModel: 'Formula 350 CBR', lengthFt: 35 }],
    recurring: { serviceType: 'detailing', dow: 2, freqWeeks: 2, price: 320 },
  },
  {
    name: 'Paul Ngo',
    email: 'paul.ngo88@gmail.com',
    phone: '952-555-0489',
    address: '2900 Casco Point Rd, Orono, MN 55356',
    notes: null,
    isPrepaid: false,
    boats: [
      { nickname: 'Board Meeting', makeModel: 'Yamaha 242X', lengthFt: 24 },
      { nickname: 'Anchor Management', makeModel: 'Lund Jon Boat', lengthFt: 16 },
    ],
  },
]

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Clearing existing demo data...')

  // Delete in FK-safe (children-first) order. Tables we don't directly seed
  // (completionPhotos, serviceBoatAssignments, timeEntries, payroll, etc.)
  // cascade-delete automatically via the ON DELETE CASCADE constraints
  // defined in lib/db/schema.ts once their parent services/users rows go.
  await db.delete(complaints)
  await db.delete(serviceAssignments)
  await db.delete(serviceBoats)
  await db.delete(invoices)
  await db.delete(services)
  await db.delete(recurringSchedules)
  await db.delete(customerReminderContacts)
  await db.delete(boats)
  await db.delete(customers)
  await db.delete(users)
  await db.delete(tierConfig)
  await db.delete(serviceTypeShares)

  console.log('Seeding tier_config...')
  await db.insert(tierConfig).values([
    { tier: 'top', deductionPct: '0' },
    { tier: 'mid', deductionPct: '2.5' },
    { tier: 'low', deductionPct: '5' },
  ])

  console.log('Seeding service_type_shares...')
  await db.insert(serviceTypeShares).values([
    { serviceType: 'recurring', employeeSharePct: '62.5' },
    { serviceType: 'detailing', employeeSharePct: '62.5' },
    { serviceType: 'buffing_waxing', employeeSharePct: '60' },
    { serviceType: 'acid_washing', employeeSharePct: '55' },
    { serviceType: 'powerwashing', employeeSharePct: '58' },
    { serviceType: 'gelcoat_wetsanding', employeeSharePct: '50' },
    { serviceType: 'captaining', employeeSharePct: '65' },
    { serviceType: 'other', employeeSharePct: '50' },
  ])

  console.log('Seeding users...')
  const [owner] = await db
    .insert(users)
    .values({
      email: 'demo-owner@squeakycleanboats.com',
      displayName: 'Dana Whitfield',
      role: 'owner',
      active: true,
    })
    .returning()

  const [manager] = await db
    .insert(users)
    .values({
      email: 'demo-manager@squeakycleanboats.com',
      displayName: 'Marcus Reyes',
      role: 'manager',
      active: true,
    })
    .returning()

  const [employee] = await db
    .insert(users)
    .values({
      email: 'demo-employee@squeakycleanboats.com',
      displayName: 'Jamie Ortiz',
      role: 'employee',
      tier: 'mid',
      active: true,
    })
    .returning()

  console.log('Seeding customers, boats, and recurring schedules...')

  type SeededCustomer = {
    id: string
    email: string | null
    isPrepaid: boolean
    boatIds: string[]
    boatLengths: number[]
    recurring?: { serviceType: ServiceType; dow: number; freqWeeks: 1 | 2; price: number }
  }

  const seededCustomers: SeededCustomer[] = []

  for (const c of CUSTOMER_SEEDS) {
    const [customerRow] = await db
      .insert(customers)
      .values({
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        notes: c.notes,
        isPrepaid: c.isPrepaid,
      })
      .returning()

    const boatIds: string[] = []
    const boatLengths: number[] = []
    for (const b of c.boats) {
      const [boatRow] = await db
        .insert(boats)
        .values({
          customerId: customerRow.id,
          nickname: b.nickname,
          makeModel: b.makeModel,
          lengthFt: b.lengthFt,
        })
        .returning()
      boatIds.push(boatRow.id)
      boatLengths.push(b.lengthFt)
    }

    if (c.recurring) {
      await db.insert(recurringSchedules).values({
        customerId: customerRow.id,
        serviceType: c.recurring.serviceType,
        defaultPrice: String(c.recurring.price),
        frequencyWeeks: c.recurring.freqWeeks,
        dayOfWeek: c.recurring.dow,
        startDate: dateOffset(-120),
        endDate: dateOffset(120),
        active: true,
        prepaid: c.isPrepaid,
      })
    }

    seededCustomers.push({
      id: customerRow.id,
      email: customerRow.email,
      isPrepaid: c.isPrepaid,
      boatIds,
      boatLengths,
      recurring: c.recurring,
    })
  }

  // A handful of customers also get an explicit reminder contact (their own
  // email) so the reminder dry-run preview on Settings has real data to show,
  // even with no Gmail credentials configured on the demo deployment.
  console.log('Seeding reminder contacts...')
  for (const c of seededCustomers.slice(0, 6)) {
    if (!c.email) continue
    await db.insert(customerReminderContacts).values({
      customerId: c.id,
      email: c.email,
      label: 'primary email',
    })
  }

  // ── Build the service occurrence list ─────────────────────────────────────
  console.log('Seeding services, service boats, and assignments...')

  type PlannedService = {
    customer: SeededCustomer
    serviceDate: string
    serviceType: ServiceType
  }

  const planned: PlannedService[] = []

  for (const c of seededCustomers) {
    if (c.recurring) {
      const dates = occurrencesForWeekday(
        c.recurring.dow,
        c.recurring.freqWeeks,
        PAST_WINDOW_START,
        FUTURE_WINDOW_END
      )
      for (const d of dates) {
        planned.push({ customer: c, serviceDate: d, serviceType: c.recurring.serviceType })
      }
    } else {
      // One-off customers: one past job, one upcoming job, each a specialty
      // service type (not "recurring", since they aren't on a plan).
      planned.push({
        customer: c,
        serviceDate: dateOffset(randInt(-30, -3)),
        serviceType: pick(ONE_OFF_SERVICE_TYPES),
      })
      planned.push({
        customer: c,
        serviceDate: dateOffset(randInt(2, FUTURE_WINDOW_END)),
        serviceType: pick(ONE_OFF_SERVICE_TYPES),
      })
    }
  }

  const today = dateOffset(0)
  let completeCount = 0
  let cancelledCount = 0
  let scheduledCount = 0
  let invoiceCount = 0

  for (const p of planned) {
    const isPast = p.serviceDate < today
    let status: 'scheduled' | 'complete' | 'cancelled'
    if (isPast) {
      status = Math.random() < 0.08 ? 'cancelled' : 'complete'
    } else {
      status = 'scheduled'
    }

    // Pick which boat(s) of the customer this job covers.
    const useBothBoats = p.customer.boatIds.length > 1 && Math.random() < 0.2
    const boatIndexes = useBothBoats ? p.customer.boatIds.map((_, i) => i) : [0]

    const rule = RATE_RULES[p.serviceType]
    const boatLines = boatIndexes.map((idx) => {
      const rate = randMoney(rule.rate[0], rule.rate[1])
      const lengthFt = p.customer.boatLengths[idx]
      const amount = rule.rateType === 'per_ft' ? rate * lengthFt : rate
      const services3 = [...BOAT_SERVICES].sort(() => Math.random() - 0.5).slice(0, randInt(2, 3))
      return {
        boatId: p.customer.boatIds[idx],
        rate,
        amount,
        description: services3.join(', '),
      }
    })
    const totalPrice = Math.round(boatLines.reduce((sum, b) => sum + b.amount, 0) * 100) / 100

    const isBigJob =
      p.serviceType === 'detailing' || p.serviceType === 'gelcoat_wetsanding' || p.serviceType === 'buffing_waxing'

    const completedByUserId = status === 'complete' ? (isBigJob && Math.random() < 0.3 ? manager.id : employee.id) : null
    const tipAmount = status === 'complete' && Math.random() < 0.4 ? String(randMoney(10, 45)) : null

    // For future services within the next week, mark them approved (as a
    // manager would have already reviewed the upcoming week); further out,
    // leave unapproved to show the "needs approval" state.
    const approvedAt =
      status === 'scheduled' ? (p.serviceDate <= dateOffset(7) ? timestampOffset(-1, 9) : null) : timestampOffset(-1, 9)

    const [serviceRow] = await db
      .insert(services)
      .values({
        customerId: p.customer.id,
        serviceDate: p.serviceDate,
        serviceType: p.serviceType,
        status,
        totalPrice: status === 'cancelled' ? null : String(totalPrice),
        tipAmount,
        completedAt: status === 'complete' ? timestampOffset(dateDiffFromToday(p.serviceDate), 14) : null,
        completedByUserId,
        approvedAt,
        approvedByUserId: approvedAt ? manager.id : null,
        notes: status === 'cancelled' ? 'Customer cancelled — weather.' : null,
      })
      .returning()

    if (status === 'cancelled') {
      cancelledCount++
      continue
    }
    if (status === 'scheduled') scheduledCount++
    if (status === 'complete') completeCount++

    for (const line of boatLines) {
      await db.insert(serviceBoats).values({
        serviceId: serviceRow.id,
        boatId: line.boatId,
        description: line.description,
        rateType: rule.rateType,
        rate: String(line.rate),
      })
    }

    // Assignments: employee does most jobs solo; bigger jobs occasionally
    // split with the manager.
    if (completedByUserId === manager.id || (status !== 'complete' && isBigJob && Math.random() < 0.3)) {
      await db.insert(serviceAssignments).values([
        { serviceId: serviceRow.id, userId: employee.id, sharePct: 70 },
        { serviceId: serviceRow.id, userId: manager.id, sharePct: 30 },
      ])
    } else {
      await db.insert(serviceAssignments).values({ serviceId: serviceRow.id, userId: employee.id, sharePct: 100 })
    }

    // Invoice completed jobs.
    if (status === 'complete') {
      const roll = Math.random()
      const invStatus: 'draft' | 'sent' | 'paid' = roll < 0.25 ? 'draft' : roll < 0.6 ? 'sent' : 'paid'
      const sentAt = invStatus !== 'draft' ? timestampOffset(dateDiffFromToday(p.serviceDate) + randInt(1, 3), 16) : null
      const paidAt = invStatus === 'paid' ? timestampOffset(dateDiffFromToday(p.serviceDate) + randInt(4, 12), 11) : null

      const [invoiceRow] = await db
        .insert(invoices)
        .values({
          serviceId: serviceRow.id,
          amount: String(totalPrice),
          status: invStatus,
          sentAt,
          paidAt,
          createdByUserId: manager.id,
        })
        .returning()

      await db.update(services).set({ invoiceId: invoiceRow.id }).where(eq(services.id, serviceRow.id))
      invoiceCount++
    }
  }

  // ── Complaints ───────────────────────────────────────────────────────────
  console.log('Seeding complaints...')

  // Grab a few completed services (with their customer) to attach complaints to.
  const completedForComplaints = await db
    .select()
    .from(services)
    .where(eq(services.status, 'complete'))
    .orderBy(desc(services.serviceDate))
    .limit(12)

  const complaintSeeds: { severity: 'minor' | 'major'; description: string; resolved: boolean }[] = [
    {
      severity: 'minor',
      description: 'Customer noted a few water spots left on the swim platform after cleaning.',
      resolved: true,
    },
    {
      severity: 'major',
      description: 'Customer says fenders were left in the water and picked up a stain against the hull. Needs a manager follow-up and possible detailing redo.',
      resolved: false,
    },
    {
      severity: 'minor',
      description: 'Slight streaking on the windshield after the wash — customer asked for a touch-up next visit.',
      resolved: false,
    },
  ]

  for (let i = 0; i < complaintSeeds.length && i < completedForComplaints.length; i++) {
    const svc = completedForComplaints[i]
    const seed = complaintSeeds[i]
    await db.insert(complaints).values({
      serviceId: svc.id,
      customerId: svc.customerId,
      description: seed.description,
      severity: seed.severity,
      resolved: seed.resolved,
      resolvedAt: seed.resolved ? timestampOffset(dateDiffFromToday(svc.serviceDate) + 1, 15) : null,
      createdByUserId: manager.id,
    })
  }

  console.log('\nDone seeding demo data:')
  console.log(`  users:                3 (owner, manager, employee)`)
  console.log(`  customers:            ${seededCustomers.length}`)
  console.log(`  boats:                ${seededCustomers.reduce((n, c) => n + c.boatIds.length, 0)}`)
  console.log(`  recurring schedules:  ${seededCustomers.filter((c) => c.recurring).length}`)
  console.log(`  services (complete):  ${completeCount}`)
  console.log(`  services (scheduled): ${scheduledCount}`)
  console.log(`  services (cancelled): ${cancelledCount}`)
  console.log(`  invoices:             ${invoiceCount}`)
  console.log(`  complaints:           ${Math.min(complaintSeeds.length, completedForComplaints.length)}`)
}

// small local helper kept near its only two call sites
function dateDiffFromToday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - todayUtc) / (24 * 60 * 60 * 1000))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
