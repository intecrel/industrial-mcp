import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withAuth } from 'next-auth/middleware'
import type { NextRequestWithAuth } from 'next-auth/middleware'

export default withAuth(
  function middleware(request: NextRequestWithAuth) {
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

    // Allow auth pages (NextAuth)
    if (request.nextUrl.pathname.startsWith('/auth/')) {
      return NextResponse.next()
    }

    // Check Auth0 session
    const token = request.nextauth.token
    const hasAuth0Session = !!token

    // Check legacy MAC verification
    const isLegacyVerified = request.cookies.get('mcp-verified')?.value === 'true'
    
    // Check for OAuth Bearer token (for Claude.ai and other OAuth clients)
    const authHeader = request.headers.get('authorization')
    const hasBearer = authHeader && authHeader.startsWith('Bearer ')
    
    // SIMPLE FIX: Handle MCP POST requests to root path  
    if (request.nextUrl.pathname === '/' && request.method === 'POST' && hasBearer) {
      console.log('🔓 MCP POST request - rewriting to /api/mcp')
      return NextResponse.rewrite(new URL('/api/mcp', request.url))
    }
    
    // Allow root endpoint for OAuth Bearer token requests (GET for discovery)
    if (request.nextUrl.pathname === '/' && hasBearer) {
      console.log('🔓 Allowing root endpoint access with Bearer token')
      return NextResponse.next()
    }

    // Protected routes that require authentication
    const protectedPaths = ['/dashboard', '/profile', '/devices', '/audit']
    const isProtectedPath = protectedPaths.some(path =>
      request.nextUrl.pathname.startsWith(path)
    )

    if (isProtectedPath) {
      // For protected paths, require Auth0 session or redirect to sign in
      if (!hasAuth0Session) {
        const signInUrl = new URL('/auth/signin', request.url)
        signInUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
        return NextResponse.redirect(signInUrl)
      }
      return NextResponse.next()
    }

    // For home page, allow access with either Auth0 session or legacy verification
    if (request.nextUrl.pathname === '/') {
      if (hasAuth0Session) {
        // User has Auth0 session, redirect to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url))
      } else if (!isLegacyVerified) {
        // No Auth0 session and not legacy verified, show home page
        return NextResponse.next()
      }
      return NextResponse.next()
    }

    // For other paths, maintain legacy behavior
    if (!isLegacyVerified && !hasAuth0Session) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow access to auth pages without token
        if (req.nextUrl.pathname.startsWith('/auth/')) {
          return true
        }
        
        // Allow API routes (handled by route-level auth)
        if (req.nextUrl.pathname.startsWith('/api')) {
          return true
        }

        // Allow OAuth and well-known endpoints
        if (req.nextUrl.pathname.startsWith('/.well-known/') || 
            req.nextUrl.pathname.startsWith('/auth/consent')) {
          return true
        }

        // Allow home page for unauthenticated users (legacy behavior)
        if (req.nextUrl.pathname === '/') {
          return true
        }

        // For protected paths, require token
        const protectedPaths = ['/dashboard', '/profile', '/devices', '/audit']
        const isProtectedPath = protectedPaths.some(path =>
          req.nextUrl.pathname.startsWith(path)
        )

        if (isProtectedPath) {
          return !!token
        }

        // Allow other paths (maintains legacy behavior)
        return true
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
)

export const config = {
  matcher: ['/((?!_next/static|favicon.ico).*)'],
}