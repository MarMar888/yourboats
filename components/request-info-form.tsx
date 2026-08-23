'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import posthog from 'posthog-js'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { requestInfo } from '@/app/request-info-action'
import { ATTRIBUTION_FIELDS, captureAttribution, type Attribution } from '@/lib/attribution'

// Formats digits as a US-style phone number while typing, e.g. "9525295203"
// -> "(952) 529-5203". This is a marketing lead form for a US-based
// business, not international billing, so a single US pattern is enough.
function formatPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '')
  // Strip a leading US country code (e.g. "+1 952 529 5203" or "19525295203")
  // so it doesn't get formatted as part of the area code.
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1)
  }
  digits = digits.slice(0, 10)
  const areaCode = digits.slice(0, 3)
  const prefix = digits.slice(3, 6)
  const line = digits.slice(6, 10)

  if (digits.length > 6) return `(${areaCode}) ${prefix}-${line}`
  if (digits.length > 3) return `(${areaCode}) ${prefix}`
  if (digits.length > 0) return `(${areaCode}`
  return ''
}

export function RequestInfoForm() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [attribution, setAttribution] = useState<Attribution>({})
  const [distinctId, setDistinctId] = useState('')
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // Captured once on mount (client-only — posthog isn't initialized during
  // SSR) so we know which channel/campaign brought this visitor before they
  // ever touch the form.
  useEffect(() => {
    setAttribution(captureAttribution())
    setDistinctId(posthog.get_distinct_id())
  }, [])

  if (status === 'success') {
    return (
      <p className="mt-4 text-sm font-medium text-primary" role="status">
        Thanks — we&apos;ll reach out soon.
      </p>
    )
  }

  return (
    <form
      ref={formRef}
      className="mt-4 flex flex-wrap items-end gap-2"
      action={(formData) => {
        setError(null)
        startTransition(async () => {
          const result = await requestInfo(formData)
          if (result.ok) {
            setStatus('success')
          } else {
            setError(result.error)
          }
        })
      }}
    >
      {/* Honeypot: hidden from real visitors, bots tend to fill every field. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* First-touch attribution, so leads land in the inbox with a source. */}
      <input type="hidden" name="phid" value={distinctId} />
      {ATTRIBUTION_FIELDS.map((key) =>
        attribution[key] ? <input key={key} type="hidden" name={key} value={attribution[key]} /> : null
      )}
      {attribution.referrer ? <input type="hidden" name="referrer" value={attribution.referrer} /> : null}
      {attribution.landing_page ? (
        <input type="hidden" name="landing_page" value={attribution.landing_page} />
      ) : null}

      <div className="grid gap-1">
        <Label htmlFor="phone" className="text-xs text-muted-foreground">
          Want more info? Leave your number.
        </Label>
        <div className="flex gap-2">
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="(555) 123-4567"
            required
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            className="h-10 w-44 sm:w-52"
            aria-invalid={error ? true : undefined}
          />
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? 'Sending…' : 'Request info'}
          </Button>
        </div>
        {error ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  )
}
