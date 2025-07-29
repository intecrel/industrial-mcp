'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function HomePage() {
  const [status, setStatus] = useState<'verified' | 'not-verified' | 'loading'>('loading')

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

        {/* Action Buttons */}
        <div className="text-center space-x-4">
          <Link 
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Access Dashboard
          </Link>
          
          {status === 'not-verified' && (
            <button 
              onClick={() => window.location.href = '/dashboard'}
              className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Verify Device
            </button>
          )}
        </div>

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