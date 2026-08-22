/**
 * Demo mode powers the public "See a demo" flow: a click-through, no-password
 * tour of the app backed by a seeded database, deployed from the `demo` git
 * branch of this same Vercel project (its own DATABASE_URL, no QuickBooks/
 * Gmail credentials). Gated the same way as dev-auth — must never be honored
 * on a real production deploy, even if the flag is accidentally left set.
 */
export function isDemoModeEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return false
  if (process.env.VERCEL_ENV === 'production') return false
  return true
}

// The demo branch deploys as a Vercel Preview, which is behind Vercel's SSO
// wall by default. The bypass token below is a "Protection Bypass for
// Automation" secret scoped to this project — it only unlocks Preview
// deployments (never affects Production or its access controls), and
// x-vercel-set-bypass-cookie persists access after the first click so the
// token isn't needed on every subsequent request.
export const DEMO_URL =
  'https://yourboats-tour.vercel.app/demo?x-vercel-protection-bypass=dWJrC9LJtfmFRHG3090bqAQSru34d0wJ&x-vercel-set-bypass-cookie=true'

export const DEMO_USER_COOKIE = 'demo_role'

export const DEMO_ROLES = [
  { role: 'owner', email: 'demo-owner@squeakycleanboats.com', label: 'Owner' },
  { role: 'manager', email: 'demo-manager@squeakycleanboats.com', label: 'Manager' },
  { role: 'employee', email: 'demo-employee@squeakycleanboats.com', label: 'Employee' },
] as const
