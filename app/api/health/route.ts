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
      debug: {
        auth0_env_vars: {
          client_id: !!process.env.AUTH0_CLIENT_ID,
          client_secret: !!process.env.AUTH0_CLIENT_SECRET,
          issuer_base_url: !!process.env.AUTH0_ISSUER_BASE_URL,
          issuer_base_url_value: process.env.AUTH0_ISSUER_BASE_URL,
          nextauth_secret: !!process.env.NEXTAUTH_SECRET,
          nextauth_url: !!process.env.NEXTAUTH_URL,
          nextauth_url_value: process.env.NEXTAUTH_URL,
          auth0_base_url: !!process.env.AUTH0_BASE_URL,
          auth0_base_url_value: process.env.AUTH0_BASE_URL,
          enable_auth0_flag: process.env.ENABLE_AUTH0,
        },
        urls: {
          vercel_url: process.env.VERCEL_URL,
          node_env: process.env.NODE_ENV,
          vercel_env: process.env.VERCEL_ENV
        }
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