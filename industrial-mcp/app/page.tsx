'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import driver from '../lib/neo4j'
import claude from '../lib/claude'

export default function HomePage() {
  const [verifying, setVerifying] = useState(false)
  const router = useRouter()

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
      })
      
      if (response.ok) {
        document.cookie = 'mcp-verified=true; path=/'
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Verification failed')
    }
    setVerifying(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-lg text-center">
        <h1 className="text-2xl font-bold mb-6">🔧 Master Control Panel</h1>
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
        >
          {verifying ? 'Verifying Connection...' : 'Verify Connection'}
        </button>
      </div>
    </div>
  )
}