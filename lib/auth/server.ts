import { createNeonAuth } from '@neondatabase/auth/next/server'

/**
 * Neon Auth requires `baseUrl` + `cookies.secret` (≥32 chars) at init.
 * `next build` often runs without full env (CI, fresh clone) — placeholders let the
 * bundle load; production must set NEON_AUTH_* in the host environment.
 */
const cookieSecret =
  process.env.NEON_AUTH_COOKIE_SECRET?.trim() ||
  '00000000000000000000000000000000' // 32 chars, build-only fallback

const authBaseUrl =
  process.env.NEON_AUTH_BASE_URL?.trim() ||
  'https://neon-auth.build-placeholder.invalid'

export const auth = createNeonAuth({
  baseUrl: authBaseUrl,
  cookies: {
    secret: cookieSecret,
  },
})
