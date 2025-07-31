import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * GET handler for verification status endpoint
 * Checks if the user has a valid mcp-verified cookie
 * Used by the homepage to determine if user should be redirected to dashboard
 */
export async function GET() {
  try {
    // Read the verification cookie with error handling
    const cookieStore = cookies()
    const verificationCookie = cookieStore.get('mcp-verified')
    const isVerified = verificationCookie?.value === 'true'
    
    console.log('🔍 Verification status check:', isVerified ? 'Verified' : 'Not verified')
    
    // Return verification status with additional metadata
    return NextResponse.json({
      verified: isVerified,
      timestamp: new Date().toISOString(),
      status: 'success'
    })
  } catch (error) {
    console.error('❌ Error checking verification status:', error)
    
    // Return safe default response on error
    return NextResponse.json({
      verified: false,
      timestamp: new Date().toISOString(),
      status: 'error',
      message: 'Unable to verify authentication status'
    }, { 
      status: 500 
    })
  }
}
