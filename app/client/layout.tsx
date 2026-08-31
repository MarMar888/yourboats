export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import { getClientSession } from '@/lib/auth/client-session'
import { clientLogout } from './actions'
import { Toaster } from 'sonner'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await getClientSession()
  if (!session) redirect('/login')

  const [customer] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, session.customerId))
    .limit(1)
  if (!customer) {
    // Session cookie outlives the customer record (e.g. staff deleted the
    // customer). Cookies can only be cleared from a Route Handler/Server
    // Action, not a Server Component render, so route through one.
    redirect('/client/expire')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between px-4 py-3">
          <Link href="/client" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" />
            Yourboats
          </Link>
          <form action={clientLogout}>
            <button type="submit" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-screen-sm px-4 py-6 space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back,</p>
          <h1 className="text-xl font-semibold tracking-tight">{customer.name}</h1>
        </div>
        {children}
      </main>
      <Toaster richColors position="bottom-right" />
    </div>
  )
}
