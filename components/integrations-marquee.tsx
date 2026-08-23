import type { ComponentType, SVGProps } from 'react'
import { Camera, MessageSquare } from 'lucide-react'
import { GmailMark, QuickBooksMark } from '@/components/brand-icons'

type Integration = {
  name: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const INTEGRATIONS: Integration[] = [
  { name: 'QuickBooks Online', Icon: QuickBooksMark },
  { name: 'Gmail', Icon: GmailMark },
  { name: 'Voice / SMS reminders', Icon: MessageSquare },
  { name: 'Photo uploads', Icon: Camera },
]

// Repeated 4x (not 2x) in a single flat, uniformly-gapped row so there's always
// enough buffer content to fill wide viewports for the whole scroll cycle — with
// only 2 copies, the strip could visibly run out of items before looping back
// (a gap would appear) on any container wider than ~2 copies' width. Nesting
// two separately-gapped "copy" divs also breaks the translateX(-50%) seam math
// (the outer gap between copies isn't counted the same as the inner ones), so
// this flattens everything into one array with a single uniform gap instead.
const MARQUEE_ITEMS = [...INTEGRATIONS, ...INTEGRATIONS, ...INTEGRATIONS, ...INTEGRATIONS]

/**
 * Horizontally auto-scrolling logo strip. Animates translateX(0) -> translateX(-25%),
 * i.e. exactly one repeat-unit's width out of four, so it loops seamlessly forever.
 * Pure CSS keyframe animation (see `animate-marquee` in tailwind.config.js) — no JS
 * timer/library — and it automatically respects the app-wide
 * `prefers-reduced-motion: reduce` rule in app/globals.css, which zeroes animation duration.
 */
export function IntegrationsMarquee() {
  return (
    <div className="mt-6 overflow-hidden border-y border-border py-6">
      <div
        role="list"
        className="flex w-max animate-marquee items-center gap-12 hover:[animation-play-state:paused]"
      >
        {MARQUEE_ITEMS.map(({ name, Icon }, i) => (
          <div
            key={`${name}-${i}`}
            role="listitem"
            aria-hidden={i >= INTEGRATIONS.length}
            className="flex shrink-0 items-center gap-2 text-muted-foreground"
          >
            <Icon className="h-6 w-6 shrink-0" />
            <span className="whitespace-nowrap text-sm font-medium">{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
