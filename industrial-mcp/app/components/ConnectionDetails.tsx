'use client'

import { useState, useEffect } from 'react'

export default function ConnectionDetails() {
  const [connectionUrl, setConnectionUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchConnectionUrl() {
      try {
        const response = await fetch('/api/claude/connect', {
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_ACCESS_TOKEN}`
          }
        })
        const data = await response.json()
        setConnectionUrl(data.url)
      } catch (err) {
        setError('Failed to fetch connection URL')
      } finally {
        setLoading(false)
      }
    }

    fetchConnectionUrl()
  }, [])

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-xl">
      <h2 className="text-xl font-bold mb-4 text-white">MCP Connection Details</h2>
      {loading ? (
        <p className="text-blue-400">Loading connection details...</p>
      ) : error ? (
        <p className="text-red-400">{error}</p>
      ) : (
        <div>
          <p className="text-gray-300 mb-2">Connection URL:</p>
          <code className="block p-3 bg-gray-900 text-green-400 rounded overflow-x-auto">
            {connectionUrl}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(connectionUrl)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Copy URL
          </button>
        </div>
      )}
    </div>
  )
}