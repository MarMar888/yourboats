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

export const DEMO_USER_COOKIE = 'demo_role'

export const DEMO_ROLES = [
  { role: 'owner', email: 'demo-owner@squeakycleanboats.com', label: 'Owner' },
  { role: 'manager', email: 'demo-manager@squeakycleanboats.com', label: 'Manager' },
  { role: 'employee', email: 'demo-employee@squeakycleanboats.com', label: 'Employee' },
] as const
