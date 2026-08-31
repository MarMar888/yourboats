import { createHash } from 'node:crypto'

// Same approach as lib/mcp/hash-token.ts: the code is short-lived and rate
// limited (not a long-random secret), so an optional pepper is what actually
// keeps a stolen DB row from being brute-forced offline.
export function hashOtp(code: string): string {
  const pepper = process.env.CLIENT_OTP_PEPPER ?? ''
  return createHash('sha256').update(pepper + code).digest('hex')
}
