import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/config/feature-flags'

export async function GET() {
  try {
    // Enhanced health check for MCP connection stability
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'industrial-mcp',
      version: '1.0.0',
      features: {
        oauth_enabled: true,
        mac_verification: isFeatureEnabled('MAC_VERIFICATION'),
        auth0_enabled: isFeatureEnabled('AUTH0'),
        landing_page: isFeatureEnabled('LANDING_PAGE')
      },
      mcp: {
        tools_available: 18,
        transports: ['mcp', 'sse', 'stdio'],
        auth_methods: ['oauth', 'mac_address'],
        token_ttl: '24h'
      }
    };

    return NextResponse.json(healthData, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
        'X-MCP-Server': 'industrial-mcp-v1'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}