import { createNeonAuth } from '@neondatabase/auth/next/server'

/**
 * Neon Auth server singleton.
 * Only created when NEON_AUTH_BASE_URL is configured.
 * Usage: auth.getSession(), auth.handler(), auth.middleware()
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    sessionDataTtl: 60 * 60 * 24 * 7, // 7 days
  },
})
