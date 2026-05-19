'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

interface PostHogIdentifyProps {
  userId: string
  email: string | null
  displayName: string | null
  role: string
}

export function PostHogIdentify({ userId, email, displayName, role }: PostHogIdentifyProps) {
  useEffect(() => {
    posthog.identify(userId, {
      email: email ?? undefined,
      name: displayName ?? undefined,
      role,
    })
  }, [userId, email, displayName, role])

  return null
}
