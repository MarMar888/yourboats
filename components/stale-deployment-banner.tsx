'use client'

import { useEffect, useState } from 'react'

// Detects the Next.js "Server Action not found" error that happens when the
// user has an old tab open and a new deployment was pushed. Prompts a reload
// instead of leaving a broken UI with no explanation.
export function StaleDeploymentBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    function handleRejection(event: PromiseRejectionEvent) {
      const msg: string =
        event.reason?.message ?? event.reason?.digest ?? String(event.reason ?? '')
      if (
        msg.includes('Server Action') && msg.includes('was not found') ||
        msg.includes('Failed to find Server Action') ||
        msg.includes('NEXT_ACTION') && msg.includes('not found')
      ) {
        event.preventDefault() // suppress console error
        setStale(true)
      }
    }

    window.addEventListener('unhandledrejection', handleRejection)
    return () => window.removeEventListener('unhandledrejection', handleRejection)
  }, [])

  if (!stale) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-between gap-4 bg-amber-500 px-4 py-3 text-sm font-medium text-amber-950 shadow-lg">
      <span>A new version was deployed — reload to get the latest.</span>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 rounded bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-900 transition-colors"
      >
        Reload now
      </button>
    </div>
  )
}
