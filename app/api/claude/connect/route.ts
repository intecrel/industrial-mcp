import { NextResponse } from 'next/server'
import { AUTH_CONFIG } from '@/lib/config'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.split(' ')[1]

  if (token !== AUTH_CONFIG.ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const connectionUrl = `${AUTH_CONFIG.BASE_URL}${AUTH_CONFIG.CLAUDE_ENDPOINT}?token=${AUTH_CONFIG.ACCESS_TOKEN}`
  
  return NextResponse.json({ 
    url: connectionUrl,
    message: 'Use this URL to connect to MCP from Claude'
  })
}