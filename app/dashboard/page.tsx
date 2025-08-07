'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MCPConnectionInfo from '@/app/components/MCPConnectionInfo'

/**
 * MCP Dashboard – provides connection status, system information
 * and the ability to log-out (clears the `mcp-verified` cookie).
 */
export default function Dashboard() {
  const router = useRouter()

  /* ------------------------------------------------------------------
   * STATE
   * ---------------------------------------------------------------- */
  const [checking, setChecking]   = useState(true)
  const [connected, setConnected] = useState(false)
  const [systemTime, setSystemTime] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* ------------------------------------------------------------------
   * EFFECT – initial auth check. If the user is *not* verified, redirect
   * them back home immediately.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const verifyStatus = async () => {
      try {
        const res  = await fetch('/api/verify/status', {
          credentials: 'include'
        })
        const data = await res.json()
        setConnected(data.verified)
        setSystemTime(new Date(data.timestamp).toLocaleString())

        if (!data.verified) {
          router.replace('/')            // not verified – kick to home
        }
      } catch (e) {
        setError('Unable to confirm verification status.')
      } finally {
        setChecking(false)
      }
    }

    verifyStatus()
  }, [router])

  /* ------------------------------------------------------------------
   * HANDLER – logout. Calls an (up-coming) API route that clears the
   * verification cookie and then redirects to the landing page.
   * ---------------------------------------------------------------- */
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    } catch (e) {
      // even if the request fails, continue with redirect
    } finally {
      router.replace('/')
    }
  }

  /* ------------------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------------- */
  if (checking) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Checking system status...</p>
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
        <div className="flex space-x-3">
          <button
            onClick={() => router.push('/admin/api-keys')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            🔑 API Keys
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* BODY -------------------------------------------------------- */}
      <section className="max-w-4xl mx-auto p-6">
        {/* CONNECTION STATUS */}
        <div className={`rounded p-4 mb-6 ${
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

        {error && (
          <p className="text-red-600 mt-6">{error}</p>
        )}
      </section>
    </main>
  )
}