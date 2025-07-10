import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * GET handler for verification status endpoint
 * Checks if the user has a valid mcp-verified cookie
 * Used by the homepage to determine if user should be redirected to dashboard
 */
export async function GET() {
  // Read the verification cookie
  const isVerified = cookies().get('mcp-verified')?.value === 'true'
  
  console.log('🔍 Verification status check:', isVerified ? 'Verified' : 'Not verified')
  
  // Return verification status
  return NextResponse.json({
    verified: isVerified,
    timestamp: new Date().toISOString()
  })
}
