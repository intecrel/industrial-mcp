'use client'

import { useState } from 'react'
import Sidebar from '../components/Sidebar'

export default function Dashboard() {
  const [copied, setCopied] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const integrationUrl = 'https://industrial-mcp.vercel.app/api/verify'
  const VALID_MAC = '84:94:37:e4:24:88'

  const handleCopy = () => {
    navigator.clipboard.writeText(integrationUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ macAddress: VALID_MAC }),
      })
      
      const data = await response.json()
      setAuthorized(data.success)
    } catch (error) {
      console.error('Verification failed:', error)
      setAuthorized(false)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-900">
      <Sidebar />
      
      <main className="ml-64 flex-1 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8">
            Master Control Panel
          </h1>
          
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 space-y-6">
            <div className="bg-gray-700 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Integration URL
                </h2>
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    authorized
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-blue-500 hover:bg-blue-600'
                  } text-white`}
                >
                  {verifying ? 'Verifying...' : authorized ? 'Authorized ✓' : 'Verify Connection'}
                </button>
              </div>
              <div className="bg-gray-600 p-4 rounded-lg">
                <code className="text-green-400 break-all">
                  {integrationUrl}
                </code>
              </div>
              <button
                onClick={handleCopy}
                className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {copied ? '✓ Copied!' : 'Copy URL'}
              </button>
            </div>
            
            <div className="text-gray-400">
              <h3 className="font-semibold mb-2">Connection Details:</h3>
              <p className="mb-2">• MAC Address: {VALID_MAC}</p>
              <p>• Status: {authorized ? 'Connected' : 'Ready to connect'}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}