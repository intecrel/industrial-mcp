/**
 * OAuth Consent Page
 * Professional consent screen for Claude.ai MCP authorization
 */

'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface ConsentPageProps {}

export default function ConsentPage({}: ConsentPageProps) {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
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

  const handleConsent = async (approved: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          approved
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Authorize Access
          </h1>
          <p className="text-gray-600">
            <strong>{clientName}</strong> wants to access your Industrial MCP Server
          </p>
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