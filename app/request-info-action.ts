'use server'

import { Resend } from 'resend'
import { logSystem } from '@/lib/log'

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
