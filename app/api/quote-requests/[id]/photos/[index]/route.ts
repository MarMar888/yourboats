import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteRequests } from '@/lib/db/schema'

// Public read proxy for quote_requests photos, mirroring
// app/api/services/[id]/photos/[photoId]/route.ts's private-blob pattern.
// No login gate here (the quote wizard and its follow-up page are
// unauthenticated); access is scoped to a photo actually stored on this
// quote request, addressed by its position in photo_urls, so the proxy
// can't be used to fetch arbitrary private blobs.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { id: quoteRequestId, index } = await params
  const idx = Number(index)
  if (!Number.isInteger(idx) || idx < 0) return NextResponse.json({ error: 'Invalid photo index' }, { status: 400 })

  const [request] = await db
    .select({ photoUrls: quoteRequests.photoUrls })
    .from(quoteRequests)
    .where(eq(quoteRequests.id, quoteRequestId))
    .limit(1)
  if (!request) return NextResponse.json({ error: 'Quote request not found' }, { status: 404 })

  const urls: string[] = request.photoUrls ? JSON.parse(request.photoUrls) : []
  const blobUrl = urls[idx]
  if (!blobUrl) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

  const blobRes = await fetch(blobUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })
  if (!blobRes.ok) return NextResponse.json({ error: 'Failed to fetch photo' }, { status: 502 })

  const contentType = blobRes.headers.get('content-type') ?? 'image/jpeg'
  return new NextResponse(blobRes.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
