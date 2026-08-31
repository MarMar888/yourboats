import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteRequests } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomer } from '@/lib/actions/create-entities'
import { convertQuoteRequestToCustomer } from '@/app/(app)/quotes/actions'
import { getBoatType } from '@/lib/quote/boat-types'

async function handleCreate(formData: FormData) {
  'use server'
  const fromQuote = (formData.get('fromQuote') as string | null)?.trim() || null
  const result = fromQuote
    ? await convertQuoteRequestToCustomer(fromQuote, formData)
    : await createCustomer(formData)

  if (result.ok) {
    redirect('customerId' in result ? `/customers/${result.customerId}` : '/customers')
  }
}

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ fromQuote?: string }>
}) {
  const { fromQuote } = await searchParams
  const quote = fromQuote
    ? (await db.select().from(quoteRequests).where(eq(quoteRequests.id, fromQuote)).limit(1))[0]
    : null

  const boatType = quote ? getBoatType(quote.boatTypeKey) : null

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={quote ? '/quotes' : '/customers'}>← Back</Link>
        </Button>
        <h1 className="text-2xl font-semibold">New customer</h1>
      </div>

      {quote && (
        <div className="mb-5 max-w-lg rounded-lg border border-primary/20 bg-accent px-4 py-3 text-sm">
          <p className="font-medium text-accent-foreground">
            Converting a quote request: ${Number(quote.quotedPrice).toFixed(2)}
          </p>
          <p className="text-accent-foreground/80">
            {boatType?.label ?? quote.boatTypeKey} · {quote.boatLengthFt} ft
            {quote.boatNickname ? ` · "${quote.boatNickname}"` : ''}. The boat will be added to this
            customer automatically.
          </p>
        </div>
      )}

      <form action={handleCreate} className="space-y-5 max-w-lg">
        {quote && <input type="hidden" name="fromQuote" value={quote.id} />}

        <div className="space-y-1.5">
          <Label htmlFor="name">Full name *</Label>
          <Input id="name" name="name" placeholder="Joe Ryan" required defaultValue={quote?.customerName ?? ''} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="joe@example.com" defaultValue={quote?.email ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" placeholder="(612) 555-0100" defaultValue={quote?.phone ?? ''} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            name="address"
            placeholder="20350 Lakeview Ave, Excelsior MN 55331"
            defaultValue={quote?.address ?? ''}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Any special instructions…"
            defaultValue={quote?.notes ?? ''}
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
            <Link href={quote ? '/quotes' : '/customers'}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
