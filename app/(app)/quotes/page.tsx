import { asc, desc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { boatModels, quoteAddons, quoteRequests, quoteServices } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { QuotesClient } from './quotes-client'

export default async function QuotesPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'manager')) {
    redirect('/dashboard')
  }

  const [requests, services, addons, boats] = await Promise.all([
    db.select().from(quoteRequests).orderBy(desc(quoteRequests.createdAt)).limit(200),
    db.select().from(quoteServices).orderBy(quoteServices.category, quoteServices.sortOrder),
    db.select().from(quoteAddons).orderBy(quoteAddons.sortOrder),
    db.select().from(boatModels).orderBy(asc(boatModels.make), asc(boatModels.model)),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.squeakycleanboats.com'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Quote requests</h1>
        <p className="text-sm text-muted-foreground">
          Signups from the public quote link, plus the pricing catalog it quotes from.
        </p>
      </div>

      <QuotesClient
        requests={requests}
        services={services}
        addons={addons}
        boatModels={boats}
        quoteUrl={`${appUrl}/quote`}
      />
    </div>
  )
}
