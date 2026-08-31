import { createNeonAuth } from '@neondatabase/auth/next/server'

/**
 * Neon Auth server singleton — lazily instantiated so module evaluation during
 * the build phase doesn't throw when env vars aren't available yet.
 * Usage: auth.getSession(), auth.handler(), auth.middleware()
 */
type AuthInstance = ReturnType<typeof createNeonAuth>

let _instance: AuthInstance | null = null

function getInstance(): AuthInstance {
  if (!_instance) {
    _instance = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: {
        secret: process.env.NEON_AUTH_COOKIE_SECRET!,
        sessionDataTtl: 60 * 60 * 24 * 7, // 7 days
        // 'strict' (the default) drops the session cookie on the whole redirect
        // chain when a navigation originates off-site — breaks coming back from
        // the QuickBooks OAuth consent screen. 'lax' still blocks CSRF via POST
        // but survives top-level GET redirects like OAuth callbacks.
        sameSite: 'lax',
      },
    })
  }
  return _instance
}

export const auth: AuthInstance = new Proxy({} as AuthInstance, {
  get(_, prop: string | symbol) {
    const instance = getInstance()
    const value = instance[prop as keyof AuthInstance]
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
