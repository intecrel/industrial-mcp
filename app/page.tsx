'use client'

import Link from 'next/link'

// This page component handles UI for GET requests to "/"
// API requests (POST/OPTIONS) are handled by /app/route.ts
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Industrial MCP
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Model Context Protocol Server for Industrial Data and Analytics
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-blue-600 text-2xl mb-3">🔐</div>
            <h3 className="text-lg font-semibold mb-2">OAuth 2.1 Authentication</h3>
            <p className="text-gray-600">Secure authentication with Bearer tokens for AI integration</p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-green-600 text-2xl mb-3">🤖</div>
            <h3 className="text-lg font-semibold mb-2">Claude Integration</h3>
            <p className="text-gray-600">MCP server compatible with Claude for AI-powered data analysis</p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-purple-600 text-2xl mb-3">📊</div>
            <h3 className="text-lg font-semibold mb-3">Multi-Database Access</h3>
            <p className="text-gray-600">Neo4j knowledge graphs and MySQL analytics in one API</p>
          </div>
        </div>

        {/* Authentication Options */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg p-8 shadow-sm mb-8">
            <h2 className="text-2xl font-semibold mb-6 text-center">Get Started</h2>

            <div className="space-y-6">
              {/* OAuth Option */}
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">OAuth 2.1 Authentication</h3>
                <p className="text-gray-600 text-sm mb-4">
                  Recommended for production use. Secure token-based authentication with refresh tokens.
                </p>
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign In with OAuth →
                </Link>
              </div>

              {/* API Key Option */}
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">API Key Authentication</h3>
                <p className="text-gray-600 text-sm mb-4">
                  For server-to-server integration. Use the x-api-key header with your API key.
                </p>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Access Dashboard →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* MCP Integration Info */}
        <div className="bg-white rounded-lg p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-4">Claude MCP Integration</h2>
          <p className="text-gray-600 mb-4">
            This server provides MCP (Model Context Protocol) tools for Claude to access industrial data and analytics.
          </p>

          <div className="space-y-4">
            <div className="bg-gray-50 rounded p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">MCP Endpoint:</p>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded block">
                https://industrial-mcp.vercel.app/api/mcp
              </code>
            </div>

            <div className="bg-gray-50 rounded p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Available Transports:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• HTTP (POST /api/mcp)</li>
                <li>• Server-Sent Events (GET /api/sse)</li>
                <li>• Standard I/O (Stdio)</li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Databases:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Neo4j Knowledge Graph (Industrial/Operational Data)</li>
                <li>• MySQL Analytics (Matomo Web Analytics)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
