import { NextResponse } from 'next/server'

const VALID_MAC = '84:94:37:e4:24:88'

export async function POST(request: Request) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { headers })
  }

  console.log('Received verification request')
  
  try {
    const body = await request.json()
    console.log('Request body:', body)
    
    if (body.macAddress === VALID_MAC) {
      console.log('MAC address verified successfully')
      return NextResponse.json({
        success: true,
        message: 'MAC address verified'
      }, { headers })
    }

    console.log('Invalid MAC address:', body.macAddress)
    return NextResponse.json({
      success: false,
      message: 'Invalid MAC address'
    }, { status: 401, headers })
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json({
      success: false,
      message: 'Invalid request format'
    }, { status: 400, headers })
  }
}