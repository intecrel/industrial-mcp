import { NextResponse } from 'next/server'
import { AUTH_CONFIG } from '../../../lib/config'

// Utility to create a simple opaque token for the frontend
const generateToken = () => crypto.randomUUID()

export async function POST(request: Request) {
  console.log('📨 Received POST')

  try {
    const body = await request.json()
    console.log('🧾 Body:', body)

    if (body.macAddress === AUTH_CONFIG.MAC_ADDRESS) {
      const token = generateToken()

      // Build response first so we can attach cookie
      const response = NextResponse.json({
        success: true,
        message: 'MAC address verified',
        token
      })

      // Persist verification in a secure cookie
      response.cookies.set({
        name: 'mcp-verified',
        value: 'true',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
      })

      console.log('✅ Verification successful, cookie set')
      return response
    } else {
      return NextResponse.json({
        success: false,
        message: 'Invalid MAC address'
      }, { status: 401 })
    }
  } catch (error) {
    console.error('⚠️ Error parsing request:', error)
    return NextResponse.json({
      success: false,
      message: 'Malformed request'
    }, { status: 400 })
  }
}