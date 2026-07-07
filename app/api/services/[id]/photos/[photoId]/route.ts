import { del } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { completionPhotos } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string; photoId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: serviceId, photoId } = await params

  const [photo] = await db
    .select({ blobUrl: completionPhotos.blobUrl })
    .from(completionPhotos)
    .where(and(eq(completionPhotos.id, photoId), eq(completionPhotos.serviceId, serviceId)))
    .limit(1)

  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

  const blobRes = await fetch(photo.blobUrl, {
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

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: serviceId, photoId } = await params

  const [photo] = await db
    .select({ blobUrl: completionPhotos.blobUrl })
    .from(completionPhotos)
    .where(and(eq(completionPhotos.id, photoId), eq(completionPhotos.serviceId, serviceId)))
    .limit(1)

  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })

  // Delete DB row first — if blob delete fails the row is gone (no broken UI reference),
  // which is preferable to a deleted blob with a live row causing broken thumbnails.
  await db.delete(completionPhotos).where(eq(completionPhotos.id, photoId))
  await del(photo.blobUrl)

  return NextResponse.json({ ok: true })
}
