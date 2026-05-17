import { db } from '@/lib/db'
import { complaints, services, customers } from '@/lib/db/schema'
import { eq, desc, asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import ResolveButton from './resolve-button'

type Filter = 'all' | 'open' | 'resolved'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function fmtDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-')
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`
}

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: rawFilter } = await searchParams
  const filter: Filter =
    rawFilter === 'open' ? 'open' : rawFilter === 'resolved' ? 'resolved' : 'all'

  const currentUser = await getCurrentUser()
  const canResolve = currentUser?.role === 'owner' || currentUser?.role === 'manager'

  // Fetch all complaints joined to services and customers
  const rows = await db
    .select({
      id: complaints.id,
      description: complaints.description,
      severity: complaints.severity,
      resolved: complaints.resolved,
      resolvedAt: complaints.resolvedAt,
      createdAt: complaints.createdAt,
      serviceDate: services.serviceDate,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(complaints)
    .innerJoin(services, eq(complaints.serviceId, services.id))
    .innerJoin(customers, eq(complaints.customerId, customers.id))
    .orderBy(asc(complaints.resolved), desc(complaints.createdAt))

  // Apply filter
  const filtered = rows.filter((r) => {
    if (filter === 'open') return !r.resolved
    if (filter === 'resolved') return r.resolved
    return true
  })

  const TAB_ITEMS: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'Resolved', value: 'resolved' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Complaints</h1>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TAB_ITEMS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === 'all' ? '/complaints' : `/complaints?filter=${tab.value}`}
            className={cn(
              'shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              filter === tab.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No complaints{filter !== 'all' ? ` in "${filter}"` : ''}.
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {filtered.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Link
                    href={`/customers/${c.customerId}`}
                    className="font-medium text-sm hover:underline"
                  >
                    {c.customerName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(c.serviceDate)}
                  </span>
                  {/* Severity badge */}
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border-0',
                      c.severity === 'major'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-yellow-50 text-yellow-700'
                    )}
                  >
                    {c.severity === 'major' ? 'Major' : 'Minor'}
                  </span>
                </div>

                {/* Description truncated to 2 lines */}
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {c.description}
                </p>
              </div>

              {/* Right side: resolved badge + resolve button */}
              <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                {c.resolved ? (
                  <Badge variant="success">Resolved</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
                {!c.resolved && canResolve && (
                  <ResolveButton complaintId={c.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
