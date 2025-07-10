import { NextResponse } from 'next/server'

const VALID_MAC = '84:94:37:e4:24:88'

export async function POST(request: Request) {
  console.log('Received verification request')
  
  try {
    const body = await request.json()
    console.log('Request body:', body)
    
    if (body.macAddress === VALID_MAC) {
      console.log('MAC address verified successfully')
      return NextResponse.json({
        success: true,
        message: 'MAC address verified'
      })
    }

    console.log('Invalid MAC address:', body.macAddress)
    return NextResponse.json({
      success: false,
      message: 'Invalid MAC address'
    }, { status: 401 })
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json({
      success: false,
      message: 'Invalid request format'
    }, { status: 400 })
  }
}