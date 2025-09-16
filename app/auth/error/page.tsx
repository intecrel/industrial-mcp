/**
 * Authentication Error Page
 * Handles Auth0 authentication errors
 */

'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

function ErrorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const errorMessages: Record<string, string> = {
    'Configuration': 'Authentication service is not properly configured',
    'AccessDenied': 'Access was denied. Please contact your administrator',
    'Verification': 'Email verification is required',
    'Default': 'An authentication error occurred'
  }

  const displayError = errorMessages[error || 'Default'] || errorMessages.Default

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <div className="text-red-500 text-4xl mb-4">❌</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Authentication Error</h1>
        <p className="text-gray-600 mb-4">{displayError}</p>
        
        {errorDescription && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">{errorDescription}</p>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={() => router.push('/')}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Go Home
          </button>
          <button
            onClick={() => router.push('/auth/signin')}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs text-gray-500">
            If you continue to experience issues, please contact support.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <ErrorContent />
    </Suspense>
  )
}