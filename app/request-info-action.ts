'use server'

import { Resend } from 'resend'
import { logSystem } from '@/lib/log'
import { getPostHogClient } from '@/lib/posthog-server'
import { ATTRIBUTION_FIELDS } from '@/lib/attribution'

// Simple, permissive phone check for a marketing lead form — not a billing
// system, so we don't pull in a full libphonenumber dependency. Requires at
// least 7 digits and allows common separators/formatting.
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/
const PHONE_DIGITS_RE = /\d/g

function isPlausiblePhone(value: string): boolean {
  if (!PHONE_RE.test(value)) return false
  const digitCount = value.match(PHONE_DIGITS_RE)?.length ?? 0
  return digitCount >= 7 && digitCount <= 15
}

// Ad platforms auto-tag their click-through links with these instead of
// utm_source (Google/Microsoft Ads' "auto-tagging" default), so a lead can
// carry a click ID with no utm_source set at all.
const CLICK_ID_SOURCE: Record<string, string> = {
  gclid: 'google-ads (gclid)',
  fbclid: 'facebook-ads (fbclid)',
  msclkid: 'microsoft-ads (msclkid)',
}

export type RequestInfoResult = { ok: true } | { ok: false; error: string }

export async function requestInfo(formData: FormData): Promise<RequestInfoResult> {
  // Honeypot: bots tend to fill every field, including hidden ones. Real
  // visitors never see or fill this field. Silently succeed (no error) so a
  // bot can't tell its submission was dropped.
  const honeypot = (formData.get('company') as string | null)?.trim()
  if (honeypot) {
    return { ok: true }
  }

  const phone = (formData.get('phone') as string | null)?.trim() ?? ''
  const name = (formData.get('name') as string | null)?.trim() || undefined

  if (!phone) {
    return { ok: false, error: 'Phone number is required.' }
  }
  if (!isPlausiblePhone(phone)) {
    return { ok: false, error: 'Enter a valid phone number.' }
  }

  const attribution: Record<string, string> = {}
  for (const key of ATTRIBUTION_FIELDS) {
    const value = (formData.get(key) as string | null)?.trim()
    if (value) attribution[key] = value
  }
  const referrer = (formData.get('referrer') as string | null)?.trim() || undefined
  const landingPage = (formData.get('landing_page') as string | null)?.trim() || undefined
  const distinctId = (formData.get('phid') as string | null)?.trim() || undefined
  const clickIdSource = Object.keys(CLICK_ID_SOURCE).find((key) => attribution[key])
  const source = attribution.utm_source
    ? [attribution.utm_source, attribution.utm_medium, attribution.utm_campaign].filter(Boolean).join(' / ')
    : clickIdSource
      ? CLICK_ID_SOURCE[clickIdSource]
      : referrer ?? 'direct'

  // Fire this independent of email delivery below — we want the lead (and
  // where it came from) captured in PostHog even if Resend isn't configured
  // or fails.
  const posthog = getPostHogClient()
  posthog.capture({
    distinctId: distinctId || 'anonymous-lead',
    event: 'lead_submitted',
    properties: { hasName: Boolean(name), source, landing_page: landingPage, referrer, ...attribution },
  })
  await posthog.shutdown()

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Not provisioned yet in this environment. Log the miss and fail
    // gracefully instead of throwing — the visitor still sees a normal
    // success state, don't expose internal integration state on a public
    // page.
    await logSystem({
      action: 'request_info_email_skipped',
      metadata: { reason: 'RESEND_API_KEY not set', hasName: Boolean(name) },
    })
    return { ok: true }
  }

  try {
    const resend = new Resend(apiKey)
    const submittedAt = new Date().toISOString()
    await resend.emails.send({
      from: 'Yourboats <leads@squeakycleanboats.com>',
      to: 'marley@squeakycleanboats.com',
      subject: 'New info request from yourboats.vercel.app',
      text: [
        'Someone requested more info from the yourboats landing page.',
        '',
        `Phone: ${phone}`,
        name ? `Name: ${name}` : undefined,
        `Source: ${source}`,
        landingPage ? `Landing page: ${landingPage}` : undefined,
        `Submitted: ${submittedAt}`,
      ]
        .filter(Boolean)
        .join('\n'),
    })

    await logSystem({
      action: 'request_info_email_sent',
      metadata: { hasName: Boolean(name) },
    })
    return { ok: true }
  } catch (err) {
    await logSystem({
      action: 'request_info_email_failed',
      error: String(err),
      metadata: { hasName: Boolean(name) },
    })
    // Still don't fail the visitor's submission over an internal email
    // delivery problem.
    return { ok: true }
  }
}
