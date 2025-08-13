import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Allow API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }
  
  // Allow OAuth well-known endpoints (part of OAuth 2.1 standard)
  if (request.nextUrl.pathname.startsWith('/.well-known/')) {
    return NextResponse.next()
  }

  // Check verification status
  const isVerified = request.cookies.get('mcp-verified')?.value === 'true'

  // Allow home page only if not verified
  if (request.nextUrl.pathname === '/' && !isVerified) {
    return NextResponse.next()
  }

  // Redirect to home if not verified
  if (!isVerified) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|favicon.ico).*)'],
}