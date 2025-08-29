'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// This page component handles UI for GET requests to "/"
// API requests (POST/OPTIONS) are handled by /app/route.ts
export default function HomePage() {
  const [status, setStatus] = useState<'verified' | 'not-verified' | 'loading'>('loading')
  const [macAddress, setMacAddress] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check verification status on load
    fetch('/api/verify/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data.verified ? 'verified' : 'not-verified')
      })
      .catch(() => setStatus('not-verified'))
  }, [])

  const validateMacAddress = (mac: string) => {
    // Basic MAC address validation (XX:XX:XX:XX:XX:XX format)
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    return macRegex.test(mac)
  }

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!validateMacAddress(macAddress)) {
      setError('Please enter a valid MAC address (XX:XX:XX:XX:XX:XX)')
      return
    }

    setVerifying(true)
    
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ macAddress }),
        credentials: 'include'
      })

      const data = await response.json()
      
      if (data.success) {
        setStatus('verified')
        // Small delay to show success, then redirect
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 1000)
      } else {
        setError(data.message || 'Verification failed')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Industrial MCP
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Master Control Program for Industrial Device Verification
          </p>
          
          {/* Status Badge */}
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            status === 'verified' 
              ? 'bg-green-100 text-green-800' 
              : status === 'not-verified'
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {status === 'verified' && '✅ Device Verified'}
            {status === 'not-verified' && '❌ Not Verified'}
            {status === 'loading' && '🔄 Checking...'}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-blue-600 text-2xl mb-3">🔧</div>
            <h3 className="text-lg font-semibold mb-2">MAC Verification</h3>
            <p className="text-gray-600">Verify industrial device MAC addresses for network access</p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-green-600 text-2xl mb-3">🤖</div>
            <h3 className="text-lg font-semibold mb-2">Claude Integration</h3>
            <p className="text-gray-600">MCP server compatible with Claude for AI-powered device management</p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-purple-600 text-2xl mb-3">📊</div>
            <h3 className="text-lg font-semibold mb-3">Real-time Status</h3>
            <p className="text-gray-600">Monitor connection status and authorized devices</p>
          </div>
        </div>

        {/* Verification Form or Dashboard Access */}
        {status === 'verified' ? (
          <div className="text-center">
            <Link 
              href="/dashboard"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Access Dashboard
            </Link>
          </div>
        ) : status === 'not-verified' ? (
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4 text-center">Device Verification</h2>
              <p className="text-gray-600 text-sm mb-4 text-center">
                Enter your device MAC address to verify access
              </p>
              
              <form onSubmit={handleVerification} className="space-y-4">
                <div>
                  <label htmlFor="macAddress" className="block text-sm font-medium text-gray-700 mb-1">
                    MAC Address
                  </label>
                  <input
                    type="text"
                    id="macAddress"
                    value={macAddress}
                    onChange={(e) => setMacAddress(e.target.value)}
                    placeholder="00:15:5d:77:c8:ae"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={verifying}
                  />
                </div>
                
                {error && (
                  <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
                    {error}
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={verifying || !macAddress}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {verifying ? 'Verifying...' : 'Verify Device'}
                </button>
              </form>
              
              <div className="mt-4 text-xs text-gray-500 text-center">
                <p>For testing: 00:15:5d:77:c8:ae</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        )}

        {/* MCP Integration Info */}
        <div className="mt-16 bg-white rounded-lg p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-4">Claude MCP Integration</h2>
          <p className="text-gray-600 mb-4">
            This server provides MCP (Model Context Protocol) tools for Claude to verify industrial devices.
          </p>
          
          <div className="bg-gray-50 rounded p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">API Endpoint:</p>
            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
              https://industrial-mcp.vercel.app/api/mcp
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}