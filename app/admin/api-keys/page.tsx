'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ApiKeyConfig {
  userId: string
  name: string
  key: string
  rateLimitPerHour?: number
  permissions: string[]
  created?: string
  lastUsed?: string
}

interface UsageStats {
  userId: string
  totalRequests: number
  lastHour: number
  topTools: Array<{tool: string, count: number}>
}

export default function ApiKeysManagement() {
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>([])
  const [usageStats, setUsageStats] = useState<Record<string, UsageStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newKey, setNewKey] = useState({
    userId: '',
    name: '',
    rateLimitPerHour: 100
  })
  const router = useRouter()

  useEffect(() => {
    loadApiKeys()
    loadUsageStats()
  }, [])

  const loadApiKeys = async () => {
    try {
      const response = await fetch('/api/admin/api-keys', {
        headers: {
          'x-api-key': localStorage.getItem('adminApiKey') || ''
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to load API keys')
      }
      
      const data = await response.json()
      setApiKeys(data.keys || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    }
  }

  const loadUsageStats = async () => {
    try {
      const response = await fetch('/api/admin/usage-stats', {
        headers: {
          'x-api-key': localStorage.getItem('adminApiKey') || ''
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setUsageStats(data.stats || {})
      }
    } catch (err) {
      console.warn('Failed to load usage stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = 'imcp-'
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newKey.userId || !newKey.name) {
      setError('User ID and name are required')
      return
    }
    
    const generatedKey = generateApiKey()
    
    try {
      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': localStorage.getItem('adminApiKey') || ''
        },
        body: JSON.stringify({
          userId: newKey.userId,
          name: newKey.name,
          key: generatedKey,
          rateLimitPerHour: newKey.rateLimitPerHour
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to create API key')
      }
      
      await loadApiKeys()
      setShowAddForm(false)
      setNewKey({ userId: '', name: '', rateLimitPerHour: 100 })
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    }
  }

  const handleRevokeKey = async (userId: string) => {
    if (!confirm(`Are you sure you want to revoke the API key for ${userId}?`)) {
      return
    }
    
    try {
      const response = await fetch(`/api/admin/api-keys/${userId}`, {
        method: 'DELETE',
        headers: {
          'x-api-key': localStorage.getItem('adminApiKey') || ''
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to revoke API key')
      }
      
      await loadApiKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading API Keys...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">API Key Management</h1>
                <p className="text-gray-600">Manage MCP server API keys and access controls</p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add New Key
              </button>
            </div>
          </div>
          
          {error && (
            <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {showAddForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Add New API Key</h2>
                <form onSubmit={handleAddKey} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      User ID
                    </label>
                    <input
                      type="text"
                      value={newKey.userId}
                      onChange={(e) => setNewKey({...newKey, userId: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., user123"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={newKey.name}
                      onChange={(e) => setNewKey({...newKey, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Production Client"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rate Limit (requests/hour)
                    </label>
                    <input
                      type="number"
                      value={newKey.rateLimitPerHour}
                      onChange={(e) => setNewKey({...newKey, rateLimitPerHour: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                      max="10000"
                    />
                  </div>
                  <div className="flex space-x-3 pt-4">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Generate Key
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="p-6">
            {apiKeys.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 text-6xl mb-4">🔑</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
                <p className="text-gray-500">Create your first API key to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-900">User</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">API Key</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Rate Limit</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Usage (Last Hour)</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Total Requests</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((key) => {
                      const stats = usageStats[key.userId] || { totalRequests: 0, lastHour: 0, topTools: [] }
                      return (
                        <tr key={key.userId} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium text-gray-900">{key.name}</div>
                              <div className="text-sm text-gray-500">{key.userId}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                              {key.key.substring(0, 12)}...{key.key.substring(key.key.length - 4)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {key.rateLimitPerHour || 'Unlimited'}/hour
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center">
                              <div className="text-sm font-medium text-gray-900">{stats.lastHour}</div>
                              {key.rateLimitPerHour && (
                                <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full" 
                                    style={{width: `${Math.min(100, (stats.lastHour / key.rateLimitPerHour) * 100)}%`}}
                                  ></div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm font-medium text-gray-900">{stats.totalRequests}</div>
                            {stats.topTools.length > 0 && (
                              <div className="text-xs text-gray-500">
                                Top: {stats.topTools[0]?.tool}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleRevokeKey(key.userId)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 bg-white shadow-lg rounded-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Usage Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{apiKeys.length}</div>
              <div className="text-sm text-blue-800">Active API Keys</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {Object.values(usageStats).reduce((sum, stats) => sum + stats.totalRequests, 0)}
              </div>
              <div className="text-sm text-green-800">Total Requests</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {Object.values(usageStats).reduce((sum, stats) => sum + stats.lastHour, 0)}
              </div>
              <div className="text-sm text-purple-800">Requests (Last Hour)</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}