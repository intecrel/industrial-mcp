/**
 * Auth0 Sign In Page
 * Professional sign-in interface with Auth0 integration
 */

'use client'

import { signIn, getSession } from 'next-auth/react'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'

function SignInContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { hasAuth, isLoading: flagsLoading } = useFeatureFlags()

  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  useEffect(() => {
    // Check if user is already signed in
    getSession().then((session) => {
      if (session) {
        router.push(callbackUrl)
      }
    })
  }, [callbackUrl, router])

  const handleSignIn = async () => {
    if (!hasAuth) {
      setError('Authentication is currently disabled')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await signIn('auth0', {
        callbackUrl,
        redirect: false,
      })

      if (result?.error) {
        setError(result.error)
      } else if (result?.url) {
        window.location.href = result.url
      }
    } catch (err) {
      setError('Failed to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (flagsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!hasAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <div className="text-yellow-500 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Authentication Unavailable</h1>
          <p className="text-gray-600 mb-4">
            Auth0 authentication is currently disabled. Please use MAC address verification.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to MAC Verification
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Sign In to Industrial MCP
          </h1>
          <p className="text-gray-600">
            Access your secure MCP gateway with enterprise-grade authentication
          </p>
        </div>

        <div className="mb-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">What you'll get:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Secure access to multi-database tools</li>
              <li>• Device management and MAC linking</li>
              <li>• Usage analytics and monitoring</li>
              <li>• Professional MCP integration</li>
            </ul>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
        >
          {loading ? 'Signing In...' : 'Sign In with Auth0'}
        </button>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            New users will be automatically registered. By signing in, you agree to our Terms of Service.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sign-in page...</p>
        </div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}