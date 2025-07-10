import { NextResponse } from 'next/server'

const VALID_MAC = '84:94:37:e4:24:88'

export async function POST(request: Request) {
  console.log('📨 Received POST')

  try {
    const body = await request.json()
    console.log('🧾 Body:', body)

    if (body.macAddress === VALID_MAC) {
      return NextResponse.json({
        success: true,
        message: 'MAC address verified'
      })
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