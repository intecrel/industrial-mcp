/**
 * Auth0 Signout Page
 * Properly signs out from both NextAuth and Auth0 sessions
 */

'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function SignOutContent() {
  const searchParams = useSearchParams()
  
  useEffect(() => {
    const performSignOut = async () => {
      try {
        // Get the current domain for returnTo parameter
        const currentOrigin = window.location.origin
        
        // Construct Auth0 logout URL to clear Auth0 session
        const auth0Domain = 'industrial-mcp-dev.auth0.com' // Your Auth0 domain
        const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID || 'your-client-id'
        const returnTo = encodeURIComponent(`${currentOrigin}/?signout=complete`)
        
        const auth0LogoutUrl = `https://${auth0Domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`
        
        // First, sign out from NextAuth session
        const response = await fetch('/api/auth/signout', {
          method: 'POST',
        })
        
        // Then redirect to Auth0 logout to clear Auth0 session
        window.location.href = auth0LogoutUrl
        
      } catch (error) {
        console.error('Sign out error:', error)
        // Fallback: redirect to home
        window.location.href = '/?signout=error'
      }
    }

    // Check if this is a return from Auth0 logout
    if (searchParams.get('signout') === 'complete') {
      // Already signed out from Auth0, redirect to home
      window.location.href = '/'
      return
    }

    performSignOut()
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Signing Out</h1>
          <p className="text-gray-600">
            Clearing all sessions... You will be redirected shortly.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignOutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Signing Out</h1>
            <p className="text-gray-600">
              Clearing all sessions... You will be redirected shortly.
            </p>
          </div>
        </div>
      </div>
    }>
      <SignOutContent />
    </Suspense>
  )
}