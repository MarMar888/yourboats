'use server'

import { Resend } from 'resend'
import { db } from '@/lib/db'
import { boatModels, quoteRequests } from '@/lib/db/schema'
import { logSystem } from '@/lib/log'
import { getPostHogClient } from '@/lib/posthog-server'
import { getQuoteCatalog } from '@/lib/quote/catalog'
import { computeQuote, selectionNeedsPhotos, type QuoteLineItem } from '@/lib/quote/pricing'
import { getBoatType } from '@/lib/quote/boat-types'
import { rankBoatModels, suggestionFromCatalogRow, type BoatSuggestion } from '@/lib/quote/boat-model-match'
import { guessBoatFromText } from '@/lib/quote/boat-ai-lookup'

const PHONE_RE = /^[+()\-.\s\d]{7,20}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isPlausiblePhone(value: string): boolean {
  if (!PHONE_RE.test(value)) return false
  const digitCount = (value.match(/\d/g) ?? []).length
  return digitCount >= 7 && digitCount <= 15
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.squeakycleanboats.com'
}

/**
 * Typeahead search for the public wizard's "type your boat" field. Searches
 * the first-party catalog first; if nothing matches and the query looks
 * like a real attempt, falls back to an AI best-effort guess (no-op if
 * AI_GATEWAY_API_KEY isn't configured; see lib/quote/boat-ai-lookup.ts).
 */
export async function searchBoatModelsAction(query: string): Promise<BoatSuggestion[]> {
  if (query.trim().length < 2) return []
  const rows = await db.select().from(boatModels)
  const catalogMatches = rankBoatModels(query, rows)
  if (catalogMatches.length > 0) return catalogMatches.map(suggestionFromCatalogRow)

  if (query.trim().length < 6) return []
  const guess = await guessBoatFromText(query)
  if (!guess || guess.confidence === 'low') return []

  return [{ id: null, make: guess.make, model: guess.model, boatTypeKey: guess.boatTypeKey, lengthFt: guess.lengthFt, source: 'ai' }]
}

export type SubmitQuoteResult =
  | { ok: true; id: string; total: number; lineItems: QuoteLineItem[]; needsPhotos: boolean }
  | { ok: false; error: string }

export async function submitQuoteRequest(formData: FormData): Promise<SubmitQuoteResult> {
  // Honeypot: real visitors never see or fill this field. Report success
  // without writing a row so a bot can't tell its submission was dropped.
  const honeypot = (formData.get('company') as string | null)?.trim()
  if (honeypot) {
    return { ok: true, id: '', total: 0, lineItems: [], needsPhotos: false }
  }

  const customerName = (formData.get('name') as string | null)?.trim() ?? ''
  const email = (formData.get('email') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() ?? ''
  const address = (formData.get('address') as string | null)?.trim() || null
  const boatTypeKey = (formData.get('boatTypeKey') as string | null)?.trim() ?? ''
  const boatNickname = (formData.get('boatNickname') as string | null)?.trim() || null
  const boatMakeModel = (formData.get('boatMakeModel') as string | null)?.trim() || null
  const boatLengthFt = Number(formData.get('boatLengthFt'))
  const boatModelIdRaw = (formData.get('boatModelId') as string | null)?.trim() || null
  const boatModelId = boatModelIdRaw && UUID_RE.test(boatModelIdRaw) ? boatModelIdRaw : null
  const planType = (formData.get('planType') as string | null)?.trim() ?? ''
  const recurringServiceKey = (formData.get('recurringServiceKey') as string | null)?.trim() || null
  const detailServiceKeys = formData.getAll('detailServiceKeys').map(String)
  const addonKeys = formData.getAll('addonKeys').map(String)
  const notes = (formData.get('notes') as string | null)?.trim() || null
  const message = (formData.get('message') as string | null)?.trim() || null
  const preferredStartDateRaw = (formData.get('preferredStartDate') as string | null)?.trim() || null
  const preferredEndDateRaw = (formData.get('preferredEndDate') as string | null)?.trim() || null

  if (!customerName) return { ok: false, error: 'Name is required.' }
  if (!phone || !isPlausiblePhone(phone)) return { ok: false, error: 'Enter a valid phone number.' }
  if (!getBoatType(boatTypeKey)) return { ok: false, error: 'Select a boat type.' }
  if (!Number.isFinite(boatLengthFt) || boatLengthFt < 5 || boatLengthFt > 200) {
    return { ok: false, error: 'Enter a valid boat length.' }
  }
  if (planType !== 'recurring' && planType !== 'detail') return { ok: false, error: 'Select a service plan.' }
  if (planType === 'recurring' && !recurringServiceKey) return { ok: false, error: 'Select a wash plan.' }
  if (planType === 'detail' && detailServiceKeys.length === 0) {
    return { ok: false, error: 'Select at least one detail service.' }
  }

  const preferredStartDate = preferredStartDateRaw && DATE_RE.test(preferredStartDateRaw) ? preferredStartDateRaw : null
  const preferredEndDate = preferredEndDateRaw && DATE_RE.test(preferredEndDateRaw) ? preferredEndDateRaw : null
  if (preferredStartDate && preferredEndDate && preferredEndDate < preferredStartDate) {
    return { ok: false, error: 'Latest date must be on or after the earliest date.' }
  }

  // Recompute the price from the live catalog; never trust a client total.
  const catalog = await getQuoteCatalog()
  const { lineItems, total } = computeQuote(
    { lengthFt: boatLengthFt, planType, recurringServiceKey, detailServiceKeys, addonKeys },
    catalog
  )

  if (lineItems.length === 0 || total <= 0) {
    return { ok: false, error: 'Select at least one service to get a quote.' }
  }

  const needsPhotos = selectionNeedsPhotos({ planType, recurringServiceKey, detailServiceKeys }, catalog.services)

  const [row] = await db
    .insert(quoteRequests)
    .values({
      customerName,
      email,
      phone,
      address,
      boatTypeKey,
      boatNickname,
      boatMakeModel,
      boatLengthFt: Math.round(boatLengthFt),
      boatModelId,
      planType,
      recurringServiceKey,
      detailServiceKeys: detailServiceKeys.length ? JSON.stringify(detailServiceKeys) : null,
      addonKeys: addonKeys.length ? JSON.stringify(addonKeys) : null,
      notes,
      message,
      preferredStartDate,
      preferredEndDate,
      quotedPrice: String(total),
      quotedPriceBreakdown: JSON.stringify(lineItems),
    })
    .returning({ id: quoteRequests.id })

  await logSystem({
    action: 'quote_request_submitted',
    entityType: 'quote_request',
    entityId: row.id,
    metadata: { boatTypeKey, planType, total, needsPhotos },
  })

  try {
    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: `quote-${row.id}`,
      event: 'quote_requested',
      properties: { boatTypeKey, planType, boatLengthFt, total, needsPhotos },
    })
    await posthog.shutdown()
  } catch {
    // Analytics must never block a submission.
  }

  const photoUploadUrl = `${appUrl()}/quote/photos/${row.id}`
  const boatType = getBoatType(boatTypeKey)
  const timingLine =
    preferredStartDate || preferredEndDate
      ? `Preferred timing: ${[preferredStartDate, preferredEndDate].filter(Boolean).join(' to ')}`
      : undefined

  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    const resend = new Resend(apiKey)

    try {
      await resend.emails.send({
        from: 'Yourboats <leads@squeakycleanboats.com>',
        to: 'marley@squeakycleanboats.com',
        subject: `New quote request: ${customerName} ($${total.toFixed(2)})`,
        text: [
          `${customerName} requested a quote from the Squeaky Clean signup link.`,
          '',
          `Phone: ${phone}`,
          email ? `Email: ${email}` : undefined,
          address ? `Address: ${address}` : undefined,
          '',
          `Boat: ${boatType?.label ?? boatTypeKey}${boatNickname ? ` ("${boatNickname}")` : ''}${boatMakeModel ? ` (${boatMakeModel})` : ''}, ${boatLengthFt} ft`,
          '',
          'Requested:',
          ...lineItems.map((li) => `  ${li.name}: $${li.price.toFixed(2)}`),
          `Total: $${total.toFixed(2)}`,
          timingLine,
          notes ? `\nNotes: ${notes}` : undefined,
          message ? `\nQuestions: ${message}` : undefined,
          needsPhotos ? `\nPhotos requested (may not be uploaded yet): ${photoUploadUrl}` : undefined,
          '\nReminder: send a QuickBooks estimate for approval before scheduling.',
        ]
          .filter(Boolean)
          .join('\n'),
      })
    } catch (err) {
      await logSystem({
        action: 'quote_request_email_failed',
        entityType: 'quote_request',
        entityId: row.id,
        error: String(err),
      })
    }

    if (email) {
      try {
        await resend.emails.send({
          from: 'Squeaky Clean Boats <leads@squeakycleanboats.com>',
          to: email,
          subject: `Your quote: $${total.toFixed(2)}`,
          text: [
            `Thanks, ${customerName.split(' ')[0]}. Here's your estimate from Squeaky Clean Boats.`,
            '',
            ...lineItems.map((li) => `  ${li.name}: $${li.price.toFixed(2)}`),
            `Total: $${total.toFixed(2)}`,
            '',
            "What's next: we'll email you a QuickBooks estimate for this quote. Please approve it there, and we'll call or text you to confirm scheduling.",
            needsPhotos
              ? `\nA few photos of your boat help us confirm this price. Add them anytime here (no rush): ${photoUploadUrl}`
              : undefined,
            '\nQuestions in the meantime? Just reply to this email or call/text us.',
          ]
            .filter(Boolean)
            .join('\n'),
        })
      } catch (err) {
        await logSystem({
          action: 'quote_request_customer_email_failed',
          entityType: 'quote_request',
          entityId: row.id,
          error: String(err),
        })
      }
    }
  } else {
    await logSystem({
      action: 'quote_request_email_skipped',
      entityType: 'quote_request',
      entityId: row.id,
      metadata: { reason: 'RESEND_API_KEY not set' },
    })
  }

  return { ok: true, id: row.id, total, lineItems, needsPhotos }
}
