const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const CLICK_ID_KEYS = ['gclid', 'fbclid', 'msclkid'] as const
const STORAGE_KEY = 'yb_attribution'

export type AttributionKey = (typeof UTM_KEYS)[number] | (typeof CLICK_ID_KEYS)[number]
export type Attribution = Partial<Record<AttributionKey, string>> & {
  referrer?: string
  landing_page?: string
}

export const ATTRIBUTION_FIELDS: readonly AttributionKey[] = [...UTM_KEYS, ...CLICK_ID_KEYS]

/**
 * First-touch attribution: captured once per browser from the URL a visitor
 * first landed on, then reused on every later form submission in this
 * browser — even if they come back another day with a clean URL (bookmarked
 * the site, typed it in directly after seeing an ad, etc).
 */
export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return {}

  const existing = window.localStorage.getItem(STORAGE_KEY)
  if (existing) {
    try {
      return JSON.parse(existing) as Attribution
    } catch {
      // Corrupt value — fall through and recapture from the current URL.
    }
  }

  const params = new URLSearchParams(window.location.search)
  const attribution: Attribution = {}
  for (const key of ATTRIBUTION_FIELDS) {
    const value = params.get(key)
    if (value) attribution[key] = value
  }
  if (document.referrer && !document.referrer.includes(window.location.host)) {
    attribution.referrer = document.referrer
  }
  attribution.landing_page = window.location.pathname

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution))
  return attribution
}
