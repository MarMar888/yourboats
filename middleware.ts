import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const devUser = request.cookies.get('dev_user')?.value

  if (pathname.startsWith('/pick-user')) {
    return NextResponse.next()
  }

  if (!devUser) {
    return NextResponse.redirect(new URL('/pick-user', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
