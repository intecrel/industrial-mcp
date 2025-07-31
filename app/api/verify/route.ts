import { NextResponse } from 'next/server'
import { AUTH_CONFIG } from '../../../lib/config'

// Utility to create a simple opaque token for the frontend
const generateToken = () => crypto.randomUUID()

export async function POST(request: Request) {
  console.log('📨 Received POST to verification endpoint')

  try {
    // Parse and validate request body
    const body = await request.json()
    console.log('🧾 Verification request received')

    // Validate request structure
    if (!body || typeof body !== 'object') {
      throw new Error('Request body must be a valid JSON object')
    }

    if (!body.macAddress) {
      return NextResponse.json({
        success: false,
        message: 'MAC address is required',
        code: 'MISSING_MAC_ADDRESS'
      }, { status: 400 })
    }

    if (typeof body.macAddress !== 'string') {
      return NextResponse.json({
        success: false,
        message: 'MAC address must be a string',
        code: 'INVALID_MAC_FORMAT'
      }, { status: 400 })
    }

    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    if (!macRegex.test(body.macAddress)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid MAC address format. Expected format: XX:XX:XX:XX:XX:XX',
        code: 'INVALID_MAC_FORMAT'
      }, { status: 400 })
    }

    // Check MAC address against configured value
    if (!AUTH_CONFIG.MAC_ADDRESS) {
      console.error('❌ No MAC address configured in environment')
      return NextResponse.json({
        success: false,
        message: 'Server configuration error',
        code: 'SERVER_CONFIG_ERROR'
      }, { status: 500 })
    }

    if (body.macAddress === AUTH_CONFIG.MAC_ADDRESS) {
      const token = generateToken()

      // Build response first so we can attach cookie
      const response = NextResponse.json({
        success: true,
        message: 'MAC address verified successfully',
        token,
        timestamp: new Date().toISOString()
      })

      // Persist verification in a secure cookie
      response.cookies.set({
        name: 'mcp-verified',
        value: 'true',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 24 * 60 * 60 // 24 hours
      })

      console.log('✅ Verification successful, secure cookie set')
      return response
    } else {
      console.log('❌ MAC address verification failed')
      return NextResponse.json({
        success: false,
        message: 'Invalid MAC address - device not authorized',
        code: 'UNAUTHORIZED_DEVICE'
      }, { status: 401 })
    }
  } catch (error) {
    console.error('⚠️ Error processing verification request:', error)
    
    // Handle JSON parsing errors specifically
    if (error instanceof SyntaxError) {
      return NextResponse.json({
        success: false,
        message: 'Invalid JSON format in request body',
        code: 'INVALID_JSON'
      }, { status: 400 })
    }

    // Handle other errors
    return NextResponse.json({
      success: false,
      message: 'Internal server error during verification',
      code: 'VERIFICATION_ERROR',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}