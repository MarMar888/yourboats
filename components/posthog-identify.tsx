'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'

interface PostHogIdentifyProps {
  userId: string
  email: string | null
  displayName: string | null
  role: string
}

export function PostHogIdentify({ userId, email, displayName, role }: PostHogIdentifyProps) {
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  // Identify the user on mount and whenever user info changes
  useEffect(() => {
    posthog.identify(userId, {
      email: email ?? undefined,
      name: displayName ?? undefined,
      role,
    })
    // Fire the initial pageview after identify so it's attributed to this user
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fire $pageview on every client-side route change (Next.js App Router
  // never does a full reload, so PostHog's auto-capture misses these)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [pathname])

  return null
}
