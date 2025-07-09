import { NextResponse } from 'next/server'

const VALID_MAC = '84:94:37:e4:24:88'

export async function POST(request: Request) {
  try {
    const { macAddress } = await request.json()
    
    if (macAddress === VALID_MAC) {
      return NextResponse.json({
        success: true,
        message: 'MAC address verified'
      })
    }

    return NextResponse.json({
      success: false,
      message: 'Invalid MAC address'
    }, { status: 401 })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Invalid request format'
    }, { status: 400 })
  }
}