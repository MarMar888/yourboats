import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomer } from '@/lib/actions/create-entities'

async function handleCreate(formData: FormData) {
  'use server'
  const result = await createCustomer(formData)
  if (result.ok) redirect(`/customers`)
}

export default function NewCustomerPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/customers">← Back</Link>
        </Button>
        <h1 className="text-2xl font-semibold">New customer</h1>
      </div>

      <form action={handleCreate} className="space-y-5 max-w-lg">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name *</Label>
          <Input id="name" name="name" placeholder="Joe Ryan" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="joe@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" placeholder="(612) 555-0100" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" placeholder="20350 Lakeview Ave, Excelsior MN 55331" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Any special instructions…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input name="isPrepaid" type="checkbox" className="h-4 w-4 rounded border-input accent-primary" />
          Prepaid customer
        </label>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit">Create customer</Button>
          <Button variant="outline" asChild>
            <Link href="/customers">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
