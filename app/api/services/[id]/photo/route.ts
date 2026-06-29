import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'

// Raster image magic-byte signatures. We sniff the real bytes instead of
// trusting the client-supplied Content-Type / filename, which prevents
// uploading an SVG (active content) by spoofing the MIME type.
const IMAGE_SIGNATURES: { ext: string; bytes: number[] }[] = [
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WEBP: "RIFF" .... "WEBP" — checked specially below.
]

function detectImageExt(buf: Uint8Array): string | null {
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.bytes.every((b, i) => buf[i] === b)) return sig.ext
  }
  // WEBP: bytes 0-3 "RIFF", bytes 8-11 "WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'webp'
  }
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: serviceId } = await params

  // Confirm service exists. Any logged-in user may upload a completion photo for
  // any service (field crews complete each other's jobs), so there is no
  // per-service ownership check here — only the authentication gate above.
  const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1)
  if (!svc) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  if (!file) return NextResponse.json({ error: 'No photo provided' }, { status: 400 })

  // Max 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Photo must be under 10 MB' }, { status: 400 })
  }

  // Validate by sniffing magic bytes, not the client-controlled MIME/extension.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = detectImageExt(bytes)
  if (!ext) {
    return NextResponse.json({ error: 'File must be a JPEG, PNG, GIF, or WEBP image' }, { status: 400 })
  }

  // Random suffix avoids deterministic overwrite of an existing photo.
  const pathname = `completion-photos/${serviceId}.${ext}`
  const blob = await put(pathname, file, {
    access: 'public',
    addRandomSuffix: true,
    contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  })

  // Persist URL to the service record
  await db.update(services).set({ completionPhotoUrl: blob.url }).where(eq(services.id, serviceId))

  return NextResponse.json({ url: blob.url })
}
