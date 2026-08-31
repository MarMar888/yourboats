import { ShieldCheck } from 'lucide-react'
import { getQuoteCatalog } from '@/lib/quote/catalog'
import { QuoteWizard } from './quote-wizard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Get an Instant Quote',
  description: 'Tell us about your boat and get a precise, instant quote from Squeaky Clean Boats. No account needed.',
}

export default async function QuotePage() {
  const catalog = await getQuoteCatalog()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.squeakycleanboats.com'

  return (
    <div className="min-h-svh bg-gradient-to-b from-accent/40 to-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-4 sm:px-6">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" />
          <span className="font-semibold tracking-tight">Squeaky Clean Boats</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Get your boat cleaning quote</h1>
        </div>

        <QuoteWizard services={catalog.services} addons={catalog.addons} appUrl={appUrl} />

        <div className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Your info is only used to send your quote and confirm scheduling.
        </div>
      </main>
    </div>
  )
}
