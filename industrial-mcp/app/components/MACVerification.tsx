'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MACVerification() {
  const [mac, setMac] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const verifyMAC = async () => {
    setVerifying(true)
    setError('')
    
    try {
      const response = await fetch('/api/auth/verify-mac', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mac }),
      })
      
      const data = await response.json()
      
      if (data.authorized) {
        sessionStorage.setItem('mcp-auth', 'true')
        router.push('/dashboard')
      } else {
        setError('Unauthorized MAC address')
      }
    } catch (err) {
      setError('Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6">🔐 MCP Access Control</h1>
        
        <input
          type="text"
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          placeholder="Enter MAC Address"
          pattern="([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})"
          className="w-full p-2 mb-4 border rounded"
        />
        
        <button
          onClick={verifyMAC}
          disabled={verifying || !mac}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
        >
          {verifying ? 'Verifying...' : 'Verify MAC Address'}
        </button>
        
        {error && (
          <p className="mt-4 text-red-500 text-sm">{error}</p>
        )}
      </div>
    </div>
  )
}