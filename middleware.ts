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
  
  // Allow OAuth consent page (part of OAuth 2.1 flow)
  if (request.nextUrl.pathname.startsWith('/auth/consent')) {
    return NextResponse.next()
  }

  // Check verification status
  const isVerified = request.cookies.get('mcp-verified')?.value === 'true'
  
  // Check for OAuth Bearer token (for Claude.ai and other OAuth clients)
  const authHeader = request.headers.get('authorization')
  const hasBearer = authHeader && authHeader.startsWith('Bearer ')
  
  // CRITICAL FIX: Handle MCP POST requests to root path
  if (request.nextUrl.pathname === '/' && request.method === 'POST' && hasBearer) {
    console.log('🔓 Allowing MCP POST request to root with Bearer token')
    console.log(`🔍 FINAL TEST: Rewriting POST / to REAL Vercel MCP adapter at /api/mcp-transport`)
    console.log(`🔍 User-Agent: ${request.headers.get('user-agent')}`)
    // FINAL TEST: Route to a direct MCP transport endpoint that uses Vercel adapter
    return NextResponse.rewrite(new URL('/api/mcp-transport', request.url))
  }
  
  // Allow root endpoint for OAuth Bearer token requests (GET for discovery)
  if (request.nextUrl.pathname === '/' && hasBearer) {
    console.log('🔓 Allowing root endpoint access with Bearer token')
    return NextResponse.next()
  }

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