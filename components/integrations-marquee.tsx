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

/**
 * Horizontally auto-scrolling logo strip. Renders the integration list twice back-to-back
 * and animates a translateX(-50%) loop, so the second copy seamlessly picks up where the
 * first left off. Pure CSS keyframe animation (see `animate-marquee` in tailwind.config.js) —
 * no JS timer/library — and it automatically respects the app-wide
 * `prefers-reduced-motion: reduce` rule in app/globals.css, which zeroes animation duration.
 */
export function IntegrationsMarquee() {
  return (
    <div className="mt-6 overflow-hidden border-y border-border py-6">
      <div className="flex w-max animate-marquee gap-12 hover:[animation-play-state:paused]">
        {[0, 1].map((copyIndex) => (
          <div
            key={copyIndex}
            role="list"
            aria-hidden={copyIndex === 1}
            className="flex shrink-0 items-center gap-12"
          >
            {INTEGRATIONS.map(({ name, Icon }) => (
              <div
                key={name}
                role="listitem"
                className="flex shrink-0 items-center gap-2 text-muted-foreground"
              >
                <Icon className="h-6 w-6 shrink-0" />
                <span className="whitespace-nowrap text-sm font-medium">{name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
