/**
 * User Consent Management Page
 * Allows users to view and revoke their OAuth consent grants
 */

'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'

interface ConsentGrant {
  id: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  granted_at: string;
  last_used: string;
  status: 'active' | 'revoked';
}

export default function ConsentManagementPage() {
  const { data: session, status } = useSession()
  const [grants, setGrants] = useState<ConsentGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && session) {
      fetchConsentGrants()
    } else if (status === 'unauthenticated') {
      setLoading(false)
    }
  }, [status, session])

  const fetchConsentGrants = async () => {
    try {
      const response = await fetch('/api/user/consent-grants')
      if (!response.ok) {
        throw new Error('Failed to fetch consent grants')
      }
      const data = await response.json()
      setGrants(data.grants || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consent grants')
    } finally {
      setLoading(false)
    }
  }

  const revokeConsent = async (grantId: string, clientName: string) => {
    if (!confirm(`Are you sure you want to revoke access for ${clientName}? This will immediately terminate their access to your data.`)) {
      return
    }

    setRevoking(grantId)
    setError(null)

    try {
      const response = await fetch(`/api/user/consent-grants/${grantId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error_description || 'Failed to revoke consent')
      }

      // Update the grant status locally
      setGrants(grants.map(grant => 
        grant.id === grantId 
          ? { ...grant, status: 'revoked' as const }
          : grant
      ))

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke consent')
    } finally {
      setRevoking(null)
    }
  }

  const formatScope = (scope: string) => {
    switch (scope) {
      case 'mcp:tools': return 'Database Tools & Analytics'
      case 'mcp:resources': return 'Data Connections'
      case 'mcp:prompts': return 'Query Templates'
      default: return scope
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading consent management...</p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">🔐</div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Sign In Required
            </h1>
            <p className="text-gray-600 mb-4">
              You need to sign in to manage your app permissions.
            </p>
          </div>

          <button
            onClick={() => signIn('auth0')}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Sign In to Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">App Permissions</h1>
                <p className="text-gray-600 mt-1">
                  Manage which applications have access to your Industrial MCP Server
                </p>
              </div>
              <div className="text-sm text-gray-500">
                Signed in as: <strong>{session?.user?.email}</strong>
              </div>
            </div>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {grants.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔒</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No App Permissions</h3>
                <p className="text-gray-600">
                  You haven't granted access to any applications yet.
                  When you authorize an app to access your MCP server, it will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {grants.map((grant) => (
                  <div
                    key={grant.id}
                    className={`border rounded-lg p-6 ${
                      grant.status === 'revoked' ? 'border-gray-200 bg-gray-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h3 className="text-lg font-medium text-gray-900">
                            {grant.client_name}
                          </h3>
                          <span className={`ml-3 px-2 py-1 text-xs rounded-full ${
                            grant.status === 'active' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {grant.status}
                          </span>
                        </div>
                        
                        <div className="mt-2">
                          <p className="text-sm text-gray-600 mb-2">This application can:</p>
                          <ul className="space-y-1">
                            {grant.scopes.map((scope, index) => (
                              <li key={index} className="flex items-center text-sm">
                                <span className="text-green-500 mr-2">✓</span>
                                <span className="text-gray-700">{formatScope(scope)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="mt-4 flex space-x-6 text-sm text-gray-500">
                          <div>
                            <span className="font-medium">Granted:</span> {' '}
                            {new Date(grant.granted_at).toLocaleDateString()}
                          </div>
                          <div>
                            <span className="font-medium">Last used:</span> {' '}
                            {new Date(grant.last_used).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div className="ml-4">
                        {grant.status === 'active' && (
                          <button
                            onClick={() => revokeConsent(grant.id, grant.client_name)}
                            disabled={revoking === grant.id}
                            className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {revoking === grant.id ? 'Revoking...' : 'Revoke Access'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Security Information</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <strong>What happens when I revoke access?</strong>
              <br />
              The application will immediately lose access to your MCP server. Any existing connections will be terminated.
            </p>
            <p>
              <strong>Can I re-authorize an application?</strong>
              <br />
              Yes, you can re-authorize any application by going through the normal connection process again.
            </p>
            <p>
              <strong>How do I know if an application is using my data?</strong>
              <br />
              The "Last used" timestamp shows when the application most recently accessed your MCP server.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}