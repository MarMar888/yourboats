import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import Link from 'next/link'

export default async function CustomersPage() {
  const all = await db.select().from(customers).orderBy(customers.name)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Customers</h1>
      </div>

      {all.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No customers yet.
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {all.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{c.name}</p>
                <p className="break-words text-sm text-muted-foreground">{c.email ?? c.phone ?? '—'}</p>
              </div>
              {c.isPrepaid && (
                <span className="w-fit rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                  Prepaid
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
