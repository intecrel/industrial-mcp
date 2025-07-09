'use client'

import { useState } from 'react'

export default function Dashboard() {
  const [copied, setCopied] = useState(false)
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL || 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const integrationUrl = `${protocol}://${baseUrl}/api/verify`

  const handleCopy = () => {
    navigator.clipboard.writeText(integrationUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">MCP Integration</h1>
      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-xl mb-4">Claude Integration URL</h2>
        <code className="block p-4 bg-gray-700 rounded break-all">
          {integrationUrl}
        </code>
        <button
          onClick={handleCopy}
          className="mt-4 px-4 py-2 bg-blue-500 rounded hover:bg-blue-600"
        >
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
        <p className="mt-4 text-gray-400">
          Use this URL in Claude's integration section to connect to your MCP
        </p>
      </div>
    </div>
  )
}