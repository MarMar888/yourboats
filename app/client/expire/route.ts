import { NextRequest, NextResponse } from 'next/server'
import { clearClientSession } from '@/lib/auth/client-session'

// Route Handler (not a Server Component) so it's allowed to mutate cookies.
// Used when a client session cookie outlives its customer record.
export async function GET(request: NextRequest) {
  await clearClientSession()
  return NextResponse.redirect(new URL('/login', request.url))
}
