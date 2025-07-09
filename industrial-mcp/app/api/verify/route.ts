import { NextResponse } from 'next/server'
import { AUTH_CONFIG } from '@/lib/config'

export async function POST(request: Request) {
  try {
    const { macAddress } = await request.json()
    
    if (macAddress === AUTH_CONFIG.MAC_ADDRESS) {
      return NextResponse.json({ 
        success: true,
        token: process.env.ACCESS_TOKEN 
      })
    }

    return NextResponse.json({ 
      success: false,
      message: 'Invalid credentials'
    }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ 
      success: false,
      message: 'Server error'
    }, { status: 500 })
  }
}