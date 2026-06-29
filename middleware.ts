import { NextResponse, type NextRequest } from 'next/server'

const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === 'true'

// Public paths that never require auth
const PUBLIC_PATHS = ['/login', '/pick-user', '/api/auth', '/api/mcp', '/ingest']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// ── Dev-auth middleware ──────────────────────────────────────────────────────
function devAuthMiddleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const devUser = request.cookies.get('dev_user')?.value
  if (!devUser) {
    return NextResponse.redirect(new URL('/pick-user', request.url))
  }

  return NextResponse.next()
}

// ── Unified export ───────────────────────────────────────────────────────────
export function middleware(request: NextRequest) {
  if (DEV_AUTH) {
    return devAuthMiddleware(request)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
