import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { validateMAC } from '@/utils/auth'

export function middleware(request: NextRequest) {
  // Allow API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // Allow public routes
  if (request.nextUrl.pathname === '/') {
    return NextResponse.next()
  }

  // Check auth session
  const isAuthenticated = request.cookies.get('mcp-auth')?.value === 'true'

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|favicon.ico).*)'],
}