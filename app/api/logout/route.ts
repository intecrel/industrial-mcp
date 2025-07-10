import { NextResponse } from 'next/server'

/**
 * POST handler for logout endpoint
 * Clears the mcp-verified cookie and any other authentication cookies
 * Called when user clicks logout in the dashboard
 */
export async function POST() {
  console.log('🚪 Logout requested')
  
  // Create response object
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully'
  })
  
  // Clear the verification cookie
  response.cookies.set({
    name: 'mcp-verified',
    value: '',
    expires: new Date(0), // Immediate expiration
    path: '/',
  })
  
  // Clear any other auth-related cookies if they exist
  // For example, if you added token cookies:
  response.cookies.set({
    name: 'mcp-token',
    value: '',
    expires: new Date(0),
    path: '/',
  })
  
  console.log('✅ Logout successful, cookies cleared')
  return response
}
