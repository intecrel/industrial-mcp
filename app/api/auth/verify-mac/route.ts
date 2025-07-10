import { NextResponse } from 'next/server'
import { validateMAC, ALLOWED_MAC } from '@/utils/auth'

export async function POST(request: Request) {
  try {
    const { mac } = await request.json()
    
    if (validateMAC(mac)) {
      return NextResponse.json({ 
        authorized: true,
        message: 'MAC Address Verified'
      })
    }

    return NextResponse.json({ 
      authorized: false,
      message: 'Unauthorized MAC Address'
    }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ 
      authorized: false,
      message: 'Invalid request'
    }, { status: 400 })
  }
}