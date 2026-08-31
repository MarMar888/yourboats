import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

// Signed session cookie for the client corner (app/client/**). Customers have
// no password: this is set after a one-time email code is verified
// (app/(auth)/login/client-actions.ts) and lets a returning visit to /login
// or the marketing homepage recognize them without asking again.

export const CLIENT_SESSION_COOKIE = 'client_session'
const SESSION_TTL_MS = 45 * 24 * 60 * 60 * 1000 // 45 days

function secret(): string {
  const s = process.env.CLIENT_SESSION_SECRET
  if (!s) throw new Error('CLIENT_SESSION_SECRET is not set')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function encode(customerId: string, exp: number): string {
  const payload = `${customerId}.${exp}`
  return `${payload}.${sign(payload)}`
}

function decode(token: string): { customerId: string; exp: number } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [customerId, expStr, sig] = parts
  const payload = `${customerId}.${expStr}`
  const expected = sign(payload)

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null

  return { customerId, exp }
}

export async function setClientSession(customerId: string): Promise<void> {
  const exp = Date.now() + SESSION_TTL_MS
  const cookieStore = await cookies()
  cookieStore.set(CLIENT_SESSION_COOKIE, encode(customerId, exp), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(exp),
  })
}

export async function clearClientSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(CLIENT_SESSION_COOKIE)
}

export type ClientSession = { customerId: string }

export async function getClientSession(): Promise<ClientSession | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(CLIENT_SESSION_COOKIE)?.value
  if (!raw) return null

  const decoded = decode(raw)
  if (!decoded) return null

  return { customerId: decoded.customerId }
}
