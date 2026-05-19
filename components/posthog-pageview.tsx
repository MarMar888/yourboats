'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'

// Fires $pageview on mount and on every SPA route change.
// Used in root layout so all pages (including /login) are tracked.
// PostHogIdentify (in app layout) fires its own pageview post-identify
// for logged-in users — that's fine, it overwrites with identified context.
export function PostHogPageView() {
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  // Initial pageview on mount
  useEffect(() => {
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [])

  // SPA navigation pageviews
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [pathname])

  return null
}
