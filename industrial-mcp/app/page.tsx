'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const [macAddress, setMacAddress] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleVerify = async () => {
    setVerifying(true)
    setError('')
    
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ macAddress }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        localStorage.setItem('mcp-token', data.token)
        router.push('/dashboard')
      } else {
        setError(data.message)
      }
    } catch (error) {
      setError('Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="p-8 bg-gray-800 rounded-lg shadow-xl text-center w-96">
        <h1 className="text-3xl font-bold mb-6 text-white">MCP Access</h1>
        <input
          type="text"
          value={macAddress}
          onChange={(e) => setMacAddress(e.target.value)}
          placeholder="Enter MAC Address"
          className="w-full p-3 mb-4 bg-gray-700 text-white rounded border border-gray-600"
        />
        <button
          onClick={handleVerify}
          disabled={verifying || !macAddress}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded transition-colors disabled:opacity-50"
        >
          {verifying ? 'Verifying...' : 'Connect to MCP'}
        </button>
        {error && (
          <p className="mt-4 text-red-400 text-sm">{error}</p>
        )}
      </div>
    </div>
  )
}