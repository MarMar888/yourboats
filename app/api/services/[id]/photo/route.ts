import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: serviceId } = await params

  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  if (!file) return NextResponse.json({ error: 'No photo provided' }, { status: 400 })

  // Validate file type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  }

  // Max 10 MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Photo must be under 10 MB' }, { status: 400 })
  }

  // Confirm service exists
  const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1)
  if (!svc) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  const ext = file.name.split('.').pop() ?? 'jpg'
  const pathname = `completion-photos/${serviceId}.${ext}`

  const blob = await put(pathname, file, {
    access: 'public',
    addRandomSuffix: false,
  })

  // Persist URL to the service record
  await db.update(services).set({ completionPhotoUrl: blob.url }).where(eq(services.id, serviceId))

  return NextResponse.json({ url: blob.url })
}
