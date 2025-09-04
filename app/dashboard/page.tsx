'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import MCPConnectionInfo from '@/app/components/MCPConnectionInfo'

interface Device {
  macAddress: string
  deviceName: string
  addedAt: string
  lastUsed?: string
  isActive: boolean
}

interface UserProfile {
  auth0Id: string
  email: string
  name: string
  linkedDevices: Device[]
  tier: string
  usage: {
    monthlyRequests: number
    usedRequests: number
    quota: number
  }
}

/**
 * MCP Dashboard – provides connection status, system information
 * and the ability to log-out (clears the `mcp-verified` cookie).
 * Enhanced with Auth0 integration and device management.
 */
export default function Dashboard() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { hasAuth, isLoading: flagsLoading } = useFeatureFlags()

  /* ------------------------------------------------------------------
   * STATE
   * ---------------------------------------------------------------- */
  const [checking, setChecking]   = useState(true)
  const [connected, setConnected] = useState(false)
  const [systemTime, setSystemTime] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Auth0 user data
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  
  // Device management
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [newMacAddress, setNewMacAddress] = useState('')
  const [addingDevice, setAddingDevice] = useState(false)

  /* ------------------------------------------------------------------
   * EFFECT – auth check with Auth0 and legacy support
   * ---------------------------------------------------------------- */
  useEffect(() => {
    if (flagsLoading) return // Wait for feature flags to load

    const initializeDashboard = async () => {
      try {
        // Auth0 mode - require session
        if (hasAuth) {
          if (status === 'loading') return // Still loading session
          if (!session) {
            router.push('/auth/signin')
            return
          }
          
          // Fetch Auth0 user data
          await fetchUserData()
        } else {
          // Legacy mode - check verification cookie
          const res = await fetch('/api/verify/status', {
            credentials: 'include'
          })
          const data = await res.json()
          setConnected(data.verified)
          setSystemTime(new Date(data.timestamp).toLocaleString())

          if (!data.verified) {
            router.replace('/')
            return
          }
        }
      } catch (e) {
        setError('Unable to confirm verification status.')
      } finally {
        setChecking(false)
      }
    }

    initializeDashboard()
  }, [hasAuth, session, status, flagsLoading, router])

  const fetchUserData = async () => {
    if (!hasAuth || !session) return

    try {
      // Fetch user profile
      const profileResponse = await fetch('/api/user/profile')
      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        setProfile(profileData.profile)
      }

      // Fetch devices
      const devicesResponse = await fetch('/api/user/devices')
      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json()
        setDevices(devicesData.devices)
      }
      
      setConnected(true)
      setSystemTime(new Date().toLocaleString())
    } catch (err) {
      console.warn('Failed to fetch user data:', err)
      setConnected(true) // Still allow dashboard access
      setSystemTime(new Date().toLocaleString())
    }
  }

  /* ------------------------------------------------------------------
   * HANDLERS
   * ---------------------------------------------------------------- */
  const handleLogout = async () => {
    try {
      if (hasAuth && session) {
        // Auth0 logout
        await signOut({ callbackUrl: '/' })
      } else {
        // Legacy logout
        await fetch('/api/logout', { method: 'POST', credentials: 'include' })
        router.replace('/')
      }
    } catch (e) {
      // even if the request fails, continue with redirect
      router.replace('/')
    }
  }

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newDeviceName.trim() || !newMacAddress.trim()) {
      setError('Please fill in all fields')
      return
    }

    setAddingDevice(true)
    setError(null)

    try {
      const response = await fetch('/api/user/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceName: newDeviceName.trim(),
          macAddress: newMacAddress.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to add device')
      }

      // Refresh devices list
      await fetchUserData()
      
      // Reset form
      setNewDeviceName('')
      setNewMacAddress('')
      setShowAddDevice(false)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add device')
    } finally {
      setAddingDevice(false)
    }
  }

  const handleRemoveDevice = async (macAddress: string) => {
    if (!confirm('Are you sure you want to unlink this device?')) {
      return
    }

    try {
      const response = await fetch(`/api/user/devices?mac=${encodeURIComponent(macAddress)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.message || 'Failed to remove device')
      }

      // Refresh devices list
      await fetchUserData()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove device')
    }
  }

  /* ------------------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------------- */
  if (checking || flagsLoading || (hasAuth && status === 'loading')) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">
            {flagsLoading ? 'Loading configuration...' : 'Checking system status...'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">
      {/* HEADER ------------------------------------------------------ */}
      <header className="flex items-center justify-between px-6 py-4 shadow bg-white">
        <h1 className="text-2xl font-bold tracking-tight text-blue-700">
          Industrial MCP Dashboard
        </h1>
        <div className="flex items-center space-x-3">
          {hasAuth && session && (
            <span className="text-sm text-gray-600">
              Welcome, {session.user.name || session.user.email}
            </span>
          )}
          <button
            onClick={() => router.push('/admin/api-keys')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors text-sm"
          >
            🔑 API Keys
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors text-sm"
          >
            {hasAuth ? 'Sign Out' : 'Logout'}
          </button>
        </div>
      </header>

      {/* BODY -------------------------------------------------------- */}
      <section className="max-w-6xl mx-auto p-6">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-xs text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* CONNECTION STATUS */}
        <div className={`rounded-lg p-4 mb-6 ${
          connected ? 'bg-green-100 border border-green-300'
                     : 'bg-red-100  border border-red-300'
        }`}>
          <p className="text-lg font-medium">
            {connected ? '✅ Connected to MCP' : '❌ Not Connected'}
          </p>
          {systemTime && (
            <p className="text-sm mt-1 text-gray-600">
              System time: {systemTime}
            </p>
          )}
        </div>

        {/* AUTH0 USER PROFILE (if enabled) */}
        {hasAuth && profile && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Account Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <p className="text-sm text-gray-900">{profile.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Plan</p>
                  <p className="text-sm text-gray-900 capitalize">{profile.tier}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Usage</p>
                  <p className="text-sm text-gray-900">
                    {profile.usage.usedRequests} / {profile.usage.quota} requests
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LINKED DEVICES (if Auth0 enabled) */}
        {hasAuth && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">Linked Devices</h2>
                <button
                  onClick={() => setShowAddDevice(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Add Device
                </button>
              </div>

              {devices.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📱</div>
                  <p className="text-gray-600 mb-4">No devices linked yet</p>
                  <p className="text-sm text-gray-500">
                    Link your MAC address to access MCP tools from your device
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {devices.map((device) => (
                    <div key={device.macAddress} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-gray-900">{device.deviceName}</h3>
                          <p className="text-sm text-gray-600 font-mono">{device.macAddress}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Added {new Date(device.addedAt).toLocaleDateString()}
                            {device.lastUsed && ` • Last used ${new Date(device.lastUsed).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            device.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {device.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => handleRemoveDevice(device.macAddress)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MCP CONNECTION INFORMATION */}
        <MCPConnectionInfo className="mb-6" />

        {/* SYSTEM INFORMATION */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-semibold mb-2">Verification URL</h2>
            {/* window check ensures SSR safety */}
            <p className="break-all text-sm text-gray-700">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/api/verify`
                : '/api/verify'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Used for MAC address verification
            </p>
          </div>

          <div className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-semibold mb-2">System Status</h2>
            <p className="text-sm text-gray-700 mb-2">
              {connected ? '🟢 MCP Server Online' : '🔴 MCP Server Offline'}
            </p>
            <p className="text-xs text-gray-500">
              Industrial tools ready for AI integration
            </p>
          </div>
        </div>

        {!hasAuth && error && (
          <p className="text-red-600 mt-6">{error}</p>
        )}
      </section>

      {/* Add Device Modal */}
      {hasAuth && showAddDevice && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
            <form onSubmit={handleAddDevice} className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Link New Device</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Device Name
                  </label>
                  <input
                    type="text"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    placeholder="e.g., My MacBook Pro"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    MAC Address
                  </label>
                  <input
                    type="text"
                    value={newMacAddress}
                    onChange={(e) => setNewMacAddress(e.target.value)}
                    placeholder="e.g., AA:BB:CC:DD:EE:FF"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Format: AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDevice(false)
                    setNewDeviceName('')
                    setNewMacAddress('')
                    setError(null)
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingDevice}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {addingDevice ? 'Adding...' : 'Add Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}