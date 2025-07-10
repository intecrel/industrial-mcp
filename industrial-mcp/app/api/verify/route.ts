import { NextResponse } from 'next/server'

const VALID_MAC = '84:94:37:e4:24:88'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: Request) {
  console.log('Received POST request:', request.method)
  console.log('Request headers:', Object.fromEntries(request.headers))

  try {
    const body = await request.json()
    console.log('Request body:', body)
    
    if (body.macAddress === VALID_MAC) {
      console.log('MAC address verified successfully')
      return new NextResponse(JSON.stringify({
        success: true,
        message: 'MAC address verified'
      }), { 
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      })
    }

    console.log('Invalid MAC address:', body.macAddress)
    return new NextResponse(JSON.stringify({
      success: false,
      message: 'Invalid MAC address'
    }), { 
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Verification error:', error)
    return new NextResponse(JSON.stringify({
      success: false,
      message: 'Invalid request format'
    }), { 
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  }
}