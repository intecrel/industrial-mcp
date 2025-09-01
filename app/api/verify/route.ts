import { NextRequest, NextResponse } from 'next/server'
import { AUTH_CONFIG } from '../../../lib/config'
import { verifyDevice, getDeviceInfo } from '../../../lib/auth/device-verification'

// Utility to create a simple opaque token for the frontend
const generateToken = () => crypto.randomUUID()

export async function POST(request: NextRequest) {
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

    // Use secure device verification system
    const deviceVerification = await verifyDevice(
      request,
      body.macAddress,
      body.deviceName, // Optional device name from client
      body.clientData  // Optional client fingerprint data
    );

    if (deviceVerification.success) {
      const token = generateToken()
      const deviceInfo = getDeviceInfo(request);

      // Build response first so we can attach cookie
      const response = NextResponse.json({
        success: true,
        message: deviceVerification.message,
        token,
        deviceId: deviceVerification.deviceId,
        deviceInfo: {
          platform: deviceInfo.platform,
          deviceId: deviceInfo.deviceId
        },
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

      // Store device info in additional cookie for tracking
      response.cookies.set({
        name: 'mcp-device-id',
        value: deviceVerification.deviceId || 'unknown',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 24 * 60 * 60 // 24 hours
      })

      console.log('✅ Device verification successful, secure cookies set');
      console.log('📱 Device info:', deviceInfo);
      return response
    } else {
      console.log('❌ Device verification failed:', deviceVerification.message)
      return NextResponse.json({
        success: false,
        message: deviceVerification.message,
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