import posthog from 'posthog-js'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  person_profiles: 'always',   // track anonymous + identified users (no 'identified_only' default)
  capture_pageview: false,      // we fire $pageview manually so we can catch SPA navigations too
  capture_pageleave: true,
  capture_exceptions: true,
  debug: process.env.NODE_ENV === 'development',
})
