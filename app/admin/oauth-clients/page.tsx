/**
 * Super Admin OAuth Clients Management Page
 * Allows super admins to view all OAuth clients and their associated users
 */

'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'

interface User {
  email: string;
  user_id?: string;
  grants_count: number;
  active_grants: number;
  first_granted: string;
  last_used: string;
  scopes: string[];
}

interface OAuthClient {
  client_id: string;
  client_name: string;
  client_description?: string;
  redirect_uris: string[];
  total_grants: number;
  active_grants: number;
  unique_users: number;
  users: User[];
}

interface AdminData {
  clients: OAuthClient[];
  summary: {
    total_clients: number;
    total_users: number;
    total_grants: number;
    active_grants: number;
    revoked_grants: number;
  };
  accessed_by: string;
  accessed_at: string;
}

export default function AdminOAuthClientsPage() {
  const { data: session, status } = useSession()
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && session) {
      fetchAdminData()
    } else if (status === 'unauthenticated') {
      setLoading(false)
    }
  }, [status, session])

  const fetchAdminData = async () => {
    try {
      const response = await fetch('/api/admin/oauth-clients')
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Super admin access required')
        }
        throw new Error('Failed to fetch OAuth clients data')
      }
      const adminData = await response.json()
      setData(adminData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data')
    } finally {
      setLoading(false)
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading admin dashboard...</p>
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
              Admin Sign In Required
            </h1>
            <p className="text-gray-600 mb-4">
              You need to sign in to access the admin dashboard.
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-red-600 mb-4">{error}</p>
            <p className="text-gray-600 text-sm">
              Contact system administrator if you believe this is an error.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <div className="text-4xl mb-4">📊</div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">No Data Available</h1>
            <p className="text-gray-600">No OAuth clients data found.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">OAuth Clients Admin</h1>
                <p className="text-gray-600 mt-1">
                  Manage OAuth clients and view user connections
                </p>
              </div>
              <div className="text-sm text-gray-500">
                Admin: <strong>{data.accessed_by}</strong>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">{data.summary.total_clients}</div>
                <div className="text-sm text-gray-600">Total Clients</div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{data.summary.total_users}</div>
                <div className="text-sm text-gray-600">Total Users</div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">{data.summary.total_grants}</div>
                <div className="text-sm text-gray-600">Total Grants</div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-500">{data.summary.active_grants}</div>
                <div className="text-sm text-gray-600">Active Grants</div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-red-500">{data.summary.revoked_grants}</div>
                <div className="text-sm text-gray-600">Revoked Grants</div>
              </div>
            </div>
          </div>

          <div className="p-6">
            {data.clients.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔒</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No OAuth Clients</h3>
                <p className="text-gray-600">No OAuth clients have been registered yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {data.clients.map((client) => (
                  <div key={client.client_id} className="border rounded-lg p-6">
                    <div 
                      className="cursor-pointer"
                      onClick={() => setSelectedClient(
                        selectedClient === client.client_id ? null : client.client_id
                      )}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <h3 className="text-lg font-medium text-gray-900">
                              {client.client_name}
                            </h3>
                            <span className="ml-2 text-xs text-gray-500">
                              {client.client_id}
                            </span>
                          </div>
                          {client.client_description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {client.client_description}
                            </p>
                          )}
                        </div>

                        <div className="ml-4 grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-lg font-semibold text-blue-600">
                              {client.unique_users}
                            </div>
                            <div className="text-xs text-gray-600">Users</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold text-green-600">
                              {client.active_grants}
                            </div>
                            <div className="text-xs text-gray-600">Active</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold text-gray-600">
                              {client.total_grants}
                            </div>
                            <div className="text-xs text-gray-600">Total</div>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500">
                        Click to {selectedClient === client.client_id ? 'hide' : 'show'} user details
                      </div>
                    </div>

                    {selectedClient === client.client_id && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h4 className="text-md font-medium text-gray-900 mb-4">
                          Connected Users ({client.users.length})
                        </h4>
                        
                        {client.users.length === 0 ? (
                          <p className="text-gray-500 text-sm">No users connected to this client.</p>
                        ) : (
                          <div className="space-y-3">
                            {client.users.map((user) => (
                              <div 
                                key={user.email}
                                className="bg-gray-50 rounded-lg p-4 flex justify-between items-start"
                              >
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">{user.email}</div>
                                  {user.user_id && (
                                    <div className="text-xs text-gray-500">
                                      User ID: {user.user_id}
                                    </div>
                                  )}
                                  
                                  <div className="mt-2">
                                    <div className="text-sm text-gray-600 mb-1">Permissions:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {user.scopes.map((scope, index) => (
                                        <span 
                                          key={index}
                                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                                        >
                                          {formatScope(scope)}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="ml-4 text-right text-sm">
                                  <div className="text-gray-600">
                                    <span className="font-medium">Grants:</span> {user.grants_count}
                                    {user.active_grants > 0 && (
                                      <span className="text-green-600"> ({user.active_grants} active)</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    First: {formatDate(user.first_granted)}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Last used: {formatDate(user.last_used)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          Last updated: {formatDate(data.accessed_at)}
        </div>
      </div>
    </div>
  )
}