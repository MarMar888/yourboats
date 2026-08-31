import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteRequests } from '@/lib/db/schema'
import { logSystem } from '@/lib/log'

const MAX_PHOTOS = 8
const MAX_SIZE = 10 * 1024 * 1024

// Raster image magic-byte signatures. We sniff the real bytes instead of
// trusting the client-supplied Content-Type / filename, which prevents
// uploading an SVG (active content) by spoofing the MIME type. Mirrors
// app/api/services/[id]/photo/route.ts.
const IMAGE_SIGNATURES: { ext: string; bytes: number[] }[] = [
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
]

const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif',
])

function detectImageExt(buf: Uint8Array): string | null {
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.bytes.every((b, i) => buf[i] === b)) return sig.ext
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'webp'
  }
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11])
    if (HEIF_BRANDS.has(brand)) return 'heic'
  }
  return null
}

// Public, unauthenticated upload endpoint for the /quote wizard and its
// "upload later" follow-up page. The quote_requests id is a random UUID that
// only the submitter (and the business, via /quotes) ever sees, acting as an
// implicit capability token; there's no login on this flow. Abuse surface
// is bounded by the per-request photo cap, size limit, and byte-sniffed
// type check below. Blobs are stored with access: 'private' (this project's
// Blob store doesn't allow public access); read them back through the
// index-based proxy at ./[index]/route.ts, not the raw blob.url.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: quoteRequestId } = await params

  const [request] = await db
    .select({ id: quoteRequests.id, photoUrls: quoteRequests.photoUrls })
    .from(quoteRequests)
    .where(eq(quoteRequests.id, quoteRequestId))
    .limit(1)
  if (!request) return NextResponse.json({ error: 'Quote request not found' }, { status: 404 })

  const existing: string[] = request.photoUrls ? JSON.parse(request.photoUrls) : []
  if (existing.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: `You can upload up to ${MAX_PHOTOS} photos.` }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  if (!file) return NextResponse.json({ error: 'No photo provided' }, { status: 400 })

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Photo must be under 10 MB' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = detectImageExt(bytes)
  if (!ext) {
    return NextResponse.json({ error: 'File must be a JPEG, PNG, GIF, WEBP, or HEIC image' }, { status: 400 })
  }

  const contentType = ext === 'jpg' ? 'image/jpeg' : ext === 'heic' ? 'image/heic' : `image/${ext}`
  const blob = await put(`quote-photos/${quoteRequestId}.${ext}`, file, {
    access: 'private',
    addRandomSuffix: true,
    contentType,
  })

  const updated = [...existing, blob.url]
  await db
    .update(quoteRequests)
    .set({ photoUrls: JSON.stringify(updated), updatedAt: new Date() })
    .where(eq(quoteRequests.id, quoteRequestId))

  await logSystem({ action: 'quote_request_photo_uploaded', entityType: 'quote_request', entityId: quoteRequestId })

  return NextResponse.json({ url: blob.url, photoUrls: updated })
}
