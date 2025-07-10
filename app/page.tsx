'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const [macAddress, setMacAddress] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  // Check if already verified and redirect to dashboard
  useEffect(() => {
    const checkVerification = async () => {
      try {
        // Use the API to check verification status via cookies
        const response = await fetch('/api/verify/status', {
          method: 'GET',
          credentials: 'include', // Important for cookies
        })
        
        const data = await response.json()
        
        if (data.verified) {
          router.push('/dashboard')
        }
      } catch (error) {
        console.error('Verification check failed:', error)
      }
    }
    
    checkVerification()
  }, [router])

  const validateMacAddress = (mac) => {
    // Basic MAC address validation (XX:XX:XX:XX:XX:XX format)
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    return macRegex.test(mac)
  }

  const handleVerify = async () => {
    // Reset states
    setError('')
    setSuccess(false)
    
    // Validate MAC address format
    if (!validateMacAddress(macAddress)) {
      setError('Please enter a valid MAC address (format: XX:XX:XX:XX:XX:XX)')
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
        credentials: 'include', // Important for cookies
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSuccess(true)
        // Short delay before redirect for better UX
        setTimeout(() => {
          router.push('/dashboard')
        }, 1000)
      } else {
        setError(data.message || 'Verification failed')
      }
    } catch (error) {
      setError('Connection error. Please try again.')
      console.error('Verification error:', error)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="p-8 bg-gray-800 rounded-lg shadow-xl text-center w-96">
        <h1 className="text-3xl font-bold mb-6 text-white">Industrial MCP</h1>
        <p className="text-gray-300 mb-6">Enter your device MAC address to connect to the Master Control Program</p>
        
        <div className="mb-6">
          <input
            type="text"
            value={macAddress}
            onChange={(e) => setMacAddress(e.target.value)}
            placeholder="XX:XX:XX:XX:XX:XX"
            className="w-full p-3 mb-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={verifying || success}
          />
          {error && (
            <p className="text-red-400 text-sm text-left mt-1">{error}</p>
          )}
        </div>
        
        <button
          onClick={handleVerify}
          disabled={verifying || success || !macAddress}
          className={`w-full font-bold py-3 px-6 rounded transition-colors ${
            success 
              ? 'bg-green-500 text-white' 
              : 'bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50'
          }`}
        >
          {verifying ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Verifying...
            </span>
          ) : success ? (
            <span className="flex items-center justify-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
              Connected! Redirecting...
            </span>
          ) : (
            'Connect to MCP'
          )}
        </button>
        
        <div className="mt-6 text-gray-400 text-xs">
          <p>Industrial MCP v1.0.0</p>
          <p className="mt-1">Secure hardware-verified connection</p>
        </div>
      </div>
    </div>
  )
}