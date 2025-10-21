'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import MCPConnectionInfo from '@/app/components/MCPConnectionInfo'

interface UserProfile {
  auth0Id: string
  email: string
  name: string
  tier: string
  usage: {
    monthlyRequests: number
    usedRequests: number
    quota: number
  }
}

/**
 * MCP Dashboard – provides connection status, system information
 * and the ability to log-out.
 * Supports both OAuth and API key authentication.
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
          // Legacy mode - allow dashboard access
          setConnected(true)
          setSystemTime(new Date().toLocaleString())
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
        router.replace('/')
      }
    } catch (e) {
      // even if the request fails, continue with redirect
      router.replace('/')
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

        {/* MCP CONNECTION INFORMATION */}
        <MCPConnectionInfo className="mb-6" />

        {/* SYSTEM INFORMATION */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-semibold mb-2">Authentication</h2>
            <p className="text-sm text-gray-700 mb-2">
              {hasAuth ? 'OAuth 2.1 Authentication' : 'API Key Authentication'}
            </p>
            <p className="text-xs text-gray-500">
              {hasAuth
                ? 'Use Bearer tokens for secure API access'
                : 'Use x-api-key header for server-to-server authentication'}
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
    </main>
  )
}
