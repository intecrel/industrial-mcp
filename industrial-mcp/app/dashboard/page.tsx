'use client'

import { useState, useEffect } from 'react'

export default function Dashboard() {
  const [verifying, setVerifying] = useState(false)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [responseDebug, setResponseDebug] = useState<string>('')
  const [integrationUrl, setIntegrationUrl] = useState<string>('')

  const testMac = '84:94:37:e4:24:88'

  // Set the URL after component mounts (client-side only)
  useEffect(() => {
    setIntegrationUrl(`${window.location.origin}/api/verify`)
  }, [])

  const handleVerify = async () => {
    if (!integrationUrl) return // Don't run if URL isn't set yet
    
    console.log('🔍 Starting verification')
    setVerifying(true)
    setError(null)
    setResponseDebug('')

    try {
      const res = await fetch(integrationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ macAddress: testMac })
      })
      console.log('📡 Fetch response status:', res.status)

      // Debug: Log raw response
      const rawText = await res.text()
      console.log('📄 Raw response:', rawText)
      setResponseDebug(rawText)

      // Try parsing JSON
      let data
      try {
        data = JSON.parse(rawText)
        console.log('📬 Parsed JSON:', data)
        setAuthorized(data.success)
        if (!data.success) setError(data.message)
      } catch (parseError) {
        console.error('🚨 JSON parse error:', parseError)
        setError('Invalid response format')
      }
    } catch (err) {
      console.error('🚨 Network error:', err)
      setError('Network or server error')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">MCP Dashboard</h1>

      <div className="mb-4">
        <label className="block font-semibold">Integration URL:</label>
        <input 
          type="text"
          readOnly
          value={integrationUrl}
          className="w-full p-2 border rounded bg-gray-50"
        />
        <button
          onClick={() => { navigator.clipboard.writeText(integrationUrl); alert('Copied') }}
          className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
        >
          Copy URL
        </button>
      </div>

      <div className="mb-4">
        <button
          onClick={handleVerify}
          disabled={verifying}
          className={`px-4 py-2 rounded text-white ${
            verifying ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {verifying ? 'Verifying...' : 'Verify MAC'}
        </button>
      </div>

      {authorized !== null && (
        <div className={`p-4 rounded ${authorized ? 'bg-green-100' : 'bg-red-100'}`}>
          {authorized ? '✅ MAC Address Verified!' : `❌ Verification failed: ${error}`}
        </div>
      )}

      {responseDebug && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="font-semibold mb-2">Debug Response:</h3>
          <pre className="whitespace-pre-wrap break-all">{responseDebug}</pre>
        </div>
      )}
    </main>
  )
}