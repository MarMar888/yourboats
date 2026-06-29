import { Sailboat, Waves } from 'lucide-react'

/**
 * Shown on the Today page when there are no jobs scheduled for today.
 * A small, calm "smooth sailing" animation — boat gently bobbing over waves.
 * Motion is gated behind motion-safe so reduced-motion users see a static scene.
 */
export function DashboardEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-16 text-center">
      <div className="relative flex h-24 w-24 items-end justify-center">
        <Sailboat
          className="mb-3 h-12 w-12 text-primary motion-safe:animate-bob"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <Waves
          className="absolute bottom-0 h-7 w-16 text-primary/30 motion-safe:animate-wave"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">Smooth sailing</h2>
      <p className="mt-1 text-sm text-muted-foreground">No jobs scheduled for today.</p>
    </div>
  )
}
