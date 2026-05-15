import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import Link from 'next/link'

export default async function CustomersPage() {
  const all = await db.select().from(customers).orderBy(customers.name)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
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
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.email ?? c.phone ?? '—'}</p>
              </div>
              {c.isPrepaid && (
                <span className="text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-0.5">
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
