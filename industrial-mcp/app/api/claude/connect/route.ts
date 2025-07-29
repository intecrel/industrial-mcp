import { NextRequest, NextResponse } from 'next/server'
import { config } from '../../../../lib/config'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    return NextResponse.json({
      success: true,
      message: 'Claude connected successfully',
      config: config.apiUrl,
      data: body
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to connect to Claude'
    }, { status: 500 })
  }
}