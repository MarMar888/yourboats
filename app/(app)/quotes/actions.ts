'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { boatModels, quoteAddons, quoteRequests, quoteServices } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { log } from '@/lib/log'
import { createBoat, createCustomer } from '@/lib/actions/create-entities'
import { getBoatType } from '@/lib/quote/boat-types'

async function requireManager() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    throw new Error('Unauthorized')
  }
  return user
}

const STATUSES = ['new', 'contacted', 'converted', 'declined'] as const

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function updateQuoteRequestStatus(id: string, status: string): Promise<ActionResult> {
  await requireManager()
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { ok: false, error: 'Invalid status.' }
  }

  await db
    .update(quoteRequests)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === 'contacted' ? { contactedAt: new Date() } : {}),
    })
    .where(eq(quoteRequests.id, id))

  await log({ action: 'update_quote_request_status', entityType: 'quote_request', entityId: id, metadata: { status } })
  revalidatePath('/quotes')
  return { ok: true }
}

export type ConvertResult = { ok: true; customerId: string } | { ok: false; error: string }

// Creates the customer (and, if the quote had boat details, the boat) from a
// submitted quote request in one step, then marks the request converted.
export async function convertQuoteRequestToCustomer(quoteRequestId: string, formData: FormData): Promise<ConvertResult> {
  await requireManager()

  const [request] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, quoteRequestId)).limit(1)
  if (!request) return { ok: false, error: 'Quote request not found.' }

  const customerResult = await createCustomer(formData)
  if (!customerResult.ok) return customerResult

  if (request.boatLengthFt) {
    const boatForm = new FormData()
    boatForm.set('customerId', customerResult.customer.id)
    boatForm.set('nickname', request.boatNickname || getBoatType(request.boatTypeKey)?.label || 'Boat')
    if (request.boatMakeModel) boatForm.set('makeModel', request.boatMakeModel)
    boatForm.set('lengthFt', String(request.boatLengthFt))
    await createBoat(boatForm)
  }

  await db
    .update(quoteRequests)
    .set({ status: 'converted', convertedCustomerId: customerResult.customer.id, updatedAt: new Date() })
    .where(eq(quoteRequests.id, quoteRequestId))

  await log({
    action: 'convert_quote_request',
    entityType: 'quote_request',
    entityId: quoteRequestId,
    metadata: { customerId: customerResult.customer.id },
  })

  revalidatePath('/quotes')
  revalidatePath('/customers')
  return { ok: true, customerId: customerResult.customer.id }
}

function parsePriceFields(formData: FormData): { rate: number; minPrice: number | null; active: boolean } | null {
  const rate = Number(formData.get('rate'))
  if (!Number.isFinite(rate) || rate < 0) return null
  const minPriceRaw = (formData.get('minPrice') as string | null)?.trim()
  const minPrice = minPriceRaw ? Number(minPriceRaw) : null
  if (minPrice != null && (!Number.isFinite(minPrice) || minPrice < 0)) return null
  const active = formData.get('active') === 'on'
  return { rate, minPrice, active }
}

export async function updateQuoteServiceItem(id: string, formData: FormData): Promise<ActionResult> {
  await requireManager()
  const parsed = parsePriceFields(formData)
  if (!parsed) return { ok: false, error: 'Enter a valid rate.' }
  const requiresPhotos = formData.get('requiresPhotos') === 'on'

  await db
    .update(quoteServices)
    .set({
      rate: String(parsed.rate),
      minPrice: parsed.minPrice != null ? String(parsed.minPrice) : null,
      active: parsed.active,
      requiresPhotos,
      updatedAt: new Date(),
    })
    .where(eq(quoteServices.id, id))

  revalidatePath('/quotes')
  revalidatePath('/quote')
  return { ok: true }
}

function parseBoatModelFields(
  formData: FormData
): { make: string; model: string; boatTypeKey: string; lengthFt: number } | { error: string } {
  const make = (formData.get('make') as string | null)?.trim() ?? ''
  const model = (formData.get('model') as string | null)?.trim() ?? ''
  const boatTypeKey = (formData.get('boatTypeKey') as string | null)?.trim() ?? ''
  const lengthFt = Number(formData.get('lengthFt'))

  if (!make) return { error: 'Make is required.' }
  if (!model) return { error: 'Model is required.' }
  if (!getBoatType(boatTypeKey)) return { error: 'Select a boat type.' }
  if (!Number.isFinite(lengthFt) || lengthFt < 5 || lengthFt > 200) return { error: 'Enter a valid length.' }

  return { make, model, boatTypeKey, lengthFt: Math.round(lengthFt) }
}

export async function createBoatModelItem(formData: FormData): Promise<ActionResult> {
  await requireManager()
  const parsed = parseBoatModelFields(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  await db.insert(boatModels).values(parsed)
  revalidatePath('/quotes')
  revalidatePath('/quote')
  return { ok: true }
}

export async function updateBoatModelItem(id: string, formData: FormData): Promise<ActionResult> {
  await requireManager()
  const parsed = parseBoatModelFields(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const active = formData.get('active') === 'on'

  await db.update(boatModels).set({ ...parsed, active }).where(eq(boatModels.id, id))
  revalidatePath('/quotes')
  revalidatePath('/quote')
  return { ok: true }
}

export async function updateQuoteAddonItem(id: string, formData: FormData): Promise<ActionResult> {
  await requireManager()
  const parsed = parsePriceFields(formData)
  if (!parsed) return { ok: false, error: 'Enter a valid rate.' }

  await db
    .update(quoteAddons)
    .set({
      rate: String(parsed.rate),
      minPrice: parsed.minPrice != null ? String(parsed.minPrice) : null,
      active: parsed.active,
      updatedAt: new Date(),
    })
    .where(eq(quoteAddons.id, id))

  revalidatePath('/quotes')
  revalidatePath('/quote')
  return { ok: true }
}
