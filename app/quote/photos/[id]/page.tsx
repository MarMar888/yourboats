import { eq } from 'drizzle-orm'
import { CheckCircle2 } from 'lucide-react'
import { db } from '@/lib/db'
import { quoteRequests } from '@/lib/db/schema'
import { getBoatType } from '@/lib/quote/boat-types'
import { PhotoUploadWidget } from '../../photo-upload-widget'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Add boat photos to your quote',
}

export default async function QuotePhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [request] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, id)).limit(1)

  if (!request) {
    return (
      <div className="min-h-svh bg-gradient-to-b from-accent/40 to-background">
        <main className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
          <h1 className="text-xl font-semibold">We couldn&apos;t find that quote</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link may be out of date. Text or call us and we&apos;ll help you out.
          </p>
        </main>
      </div>
    )
  }

  const boatType = getBoatType(request.boatTypeKey)
  const photoUrls: string[] = request.photoUrls ? JSON.parse(request.photoUrls) : []

  return (
    <div className="min-h-svh bg-gradient-to-b from-accent/40 to-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4 sm:px-6">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" />
          <span className="font-semibold tracking-tight">Squeaky Clean Boats</span>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
        <div className="rounded-xl border bg-card p-8 shadow-[0_1px_0_hsl(var(--foreground)/0.04),0_16px_40px_hsl(var(--foreground)/0.08)]">
          <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Add photos to your quote</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {request.customerName.split(' ')[0]}, a few photos of{' '}
            {boatType?.label.toLowerCase() ?? 'your boat'} help us confirm the ${Number(request.quotedPrice).toFixed(2)} estimate before scheduling.
          </p>

          <div className="mt-6">
            <PhotoUploadWidget quoteRequestId={request.id} initialPhotoUrls={photoUrls} />
          </div>
        </div>
      </main>
    </div>
  )
}
