import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { updateCustomerFromForm } from './actions'

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1)

  if (!customer) notFound()

  const action = updateCustomerFromForm.bind(null, id)

  return (
    <div className="max-w-xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/customers/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mb-3"
        >
          ← {customer.name}
        </Link>
        <h1 className="text-2xl font-semibold">Edit customer</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={customer.name}
                required
                placeholder="Joe Ryan"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={customer.email ?? ''}
                  placeholder="joe@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={customer.phone ?? ''}
                  placeholder="(612) 555-0100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                defaultValue={customer.address ?? ''}
                placeholder="20350 Lakeview Ave, Excelsior MN 55331"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes / Gate code</Label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={customer.notes ?? ''}
                placeholder="Gate code, special instructions, KISS content…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                name="isPrepaid"
                type="checkbox"
                defaultChecked={customer.isPrepaid}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Prepaid customer
            </label>

            {customer.qboCustomerId && (
              <p className="text-xs text-muted-foreground">
                Name, email, phone, and address will be synced to QuickBooks. Notes stay local.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit">Save changes</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/customers/${id}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
