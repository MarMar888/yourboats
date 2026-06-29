/**
 * Whether the passwordless dev-auth path (dev_user cookie + /pick-user) is active.
 *
 * Dev auth is convenient locally but is a full authentication bypass: anyone can
 * pick "owner" with no password. It must NEVER be honored on a production deploy,
 * even if NEXT_PUBLIC_DEV_AUTH is accidentally left set to 'true' in prod env.
 * On Vercel, VERCEL_ENV === 'production' is the reliable prod signal.
 */
export function isDevAuthEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEV_AUTH !== 'true') return false
  if (process.env.VERCEL_ENV === 'production') return false
  return true
}
