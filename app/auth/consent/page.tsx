/**
 * OAuth Consent Page
 * Professional consent screen for Claude.ai MCP authorization
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession, signIn, signOut } from 'next-auth/react'

function ConsentForm() {
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [csrfToken, setCsrfToken] = useState<string>('')
  const [csrfData, setCsrfData] = useState<any>(null)
  
  // Extract OAuth parameters from URL
  const clientId = searchParams.get('client_id')
  const clientName = searchParams.get('client_name') || 'Claude.ai'
  const scope = searchParams.get('scope') || 'mcp:tools mcp:resources mcp:prompts'
  const redirectUri = searchParams.get('redirect_uri')
  const state = searchParams.get('state')
  const codeChallenge = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')
  
  // Parse scopes for display
  const scopes = scope.split(' ').map(s => {
    switch (s) {
      case 'mcp:tools': return 'Access MCP tools (database queries, analytics)'
      case 'mcp:resources': return 'Access MCP resources (data connections)'
      case 'mcp:prompts': return 'Access MCP prompts (query templates)'
      default: return s
    }
  })

  // Handle authentication requirement
  const handleAuthRequired = async () => {
    // Store current URL with OAuth parameters for redirect after login
    const currentUrl = window.location.href
    sessionStorage.setItem('oauth_redirect_after_login', currentUrl)
    
    // Clear any existing NextAuth session to force fresh login
    // This ensures MCP reconnections always show Auth0 login screen
    if (session) {
      console.log('🔄 Clearing existing NextAuth session for fresh MCP login')
      await signOut({ redirect: false })
      // Small delay to ensure session is cleared before redirecting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Redirect to Auth0 signin with fresh login prompt
    // This forces Auth0 to show login screen even if user has existing session
    await signIn('auth0', { 
      callbackUrl: currentUrl,
      redirect: true
    }, {
      prompt: 'login'
    })
  }

  // Check for post-login redirect
  useEffect(() => {
    if (status === 'authenticated' && session) {
      const storedUrl = sessionStorage.getItem('oauth_redirect_after_login')
      if (storedUrl && storedUrl !== window.location.href) {
        sessionStorage.removeItem('oauth_redirect_after_login')
        // We're already at the right URL, just continue with the flow
      }
    }
  }, [status, session])

  // Fetch CSRF token when user is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session && !csrfToken) {
      fetch('/api/csrf')
        .then(res => res.json())
        .then(data => {
          if (data.csrf_token) {
            setCsrfToken(data.csrf_token)
            setCsrfData(data)
          }
        })
        .catch(err => {
          console.error('Failed to fetch CSRF token:', err)
          setError('Failed to load security token. Please refresh the page.')
        })
    }
  }, [status, session, csrfToken])

  const handleConsent = async (approved: boolean) => {
    setLoading(true)
    setError(null)

    if (!csrfToken || !csrfData) {
      setError('Security token not available. Please refresh the page.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          approved,
          _csrf_token: csrfData._csrf_token_hash,
          _csrf_expires: csrfData._csrf_expires
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error_description || 'Authorization failed')
      }

      const result = await response.json()
      
      if (result.redirect_url) {
        // Redirect back to Claude.ai
        window.location.href = result.redirect_url
      } else {
        throw new Error('No redirect URL received')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  if (!clientId || !redirectUri) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid Authorization Request</h1>
            <p className="text-gray-600">Missing required OAuth parameters.</p>
          </div>
        </div>
      </div>
    )
  }

  // Loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking authentication...</p>
          </div>
        </div>
      </div>
    )
  }

  // Authentication required state
  if (status === 'unauthenticated' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">🔐</div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Authentication Required
            </h1>
            <p className="text-gray-600 mb-4">
              You must sign in to authorize <strong>{clientName}</strong> to access your Industrial MCP Server.
            </p>
          </div>

          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Why do I need to sign in?</h3>
            <p className="text-sm text-blue-800">
              For security, we need to verify your identity before granting access to your database tools and analytics.
            </p>
          </div>

          <button
            onClick={handleAuthRequired}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Sign In to Continue
          </button>

          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              You'll be redirected back here after signing in.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Authorize Access
          </h1>
          <p className="text-gray-600 mb-2">
            <strong>{clientName}</strong> wants to access your Industrial MCP Server
          </p>
          {session?.user && (
            <p className="text-sm text-gray-500">
              Signed in as: <strong>{session.user.email}</strong>
            </p>
          )}
        </div>

        <div className="mb-6">
          <h3 className="font-medium text-gray-900 mb-3">This application will be able to:</h3>
          <ul className="space-y-2">
            {scopes.map((scope, index) => (
              <li key={index} className="flex items-start">
                <span className="text-green-500 mr-2 mt-0.5">✓</span>
                <span className="text-gray-700 text-sm">{scope}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Industrial MCP Server</strong> provides secure access to your database analytics and knowledge graph tools.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={() => handleConsent(false)}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => handleConsent(true)}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Authorizing...' : 'Allow'}
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            By authorizing, you allow {clientName} to access your Industrial MCP Server with the permissions listed above.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ConsentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    }>
      <ConsentForm />
    </Suspense>
  )
}