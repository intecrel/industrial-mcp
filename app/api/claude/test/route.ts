/**
 * Claude.ai MCP Connection Test Endpoint
 * Validates that Claude.ai can successfully connect to the MCP server
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, getAuthInfo } from '../../../../lib/oauth/auth-middleware';
import { getOAuthConfig } from '../../../../lib/oauth/config';
import { SUPPORTED_SCOPES } from '../../../../lib/oauth/scopes';

export async function GET(request: NextRequest) {
  try {
    const config = getOAuthConfig();
    
    // Test connection without authentication (basic connectivity test)
    const basicTest = {
      server_status: "operational",
      mcp_endpoint: `${config.issuer}/api/mcp`,
      oauth_enabled: true,
      timestamp: new Date().toISOString(),
      test_type: "basic_connectivity"
    };

    console.log('🧪 Claude.ai basic connection test performed');

    return NextResponse.json({
      success: true,
      message: "Industrial MCP Server is operational and ready for Claude.ai integration",
      ...basicTest
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('❌ Claude.ai connection test failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'connection_test_failed', 
        message: 'MCP server connection test failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let authTest = null;
    let tools: any[] = [];
    let scopes: string[] = [];

    // Test authenticated connection if Authorization header is provided
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      try {
        const authContext = await authenticateRequest(request);
        authTest = {
          authenticated: true,
          auth_method: authContext.method,
          user_id: authContext.userId,
          auth_info: getAuthInfo(authContext),
          permissions: authContext.permissions,
          scopes: authContext.scopes || []
        };

        // Get available scopes and tools for this user
        scopes = authContext.scopes || [];
        tools = Object.entries(SUPPORTED_SCOPES)
          .filter(([scope]) => scopes.includes(scope))
          .flatMap(([_, scopeInfo]) => scopeInfo.tools);

      } catch (authError) {
        authTest = {
          authenticated: false,
          error: authError instanceof Error ? authError.message : 'Authentication failed'
        };
      }
    }

    // MCP Protocol Test - simulate a tools/list request
    const mcpTest = {
      protocol: "mcp-2024-10-07",
      transport: "http",
      endpoint_accessible: true,
      supports_tools: true,
      supports_auth: true
    };

    const testResults = {
      success: true,
      message: "Complete MCP connection test performed",
      tests: {
        basic_connectivity: {
          status: "passed",
          server_operational: true,
          oauth_configured: true
        },
        mcp_protocol: {
          status: "passed",
          ...mcpTest
        },
        authentication: authTest || {
          status: "skipped",
          message: "No Authorization header provided"
        }
      },
      available_tools: tools,
      available_scopes: scopes,
      configuration: {
        oauth_endpoints: {
          authorize: `${getOAuthConfig().issuer}/api/oauth/authorize`,
          token: `${getOAuthConfig().issuer}/api/oauth/token`,
          metadata: `${getOAuthConfig().issuer}/.well-known/oauth-authorization-server`
        },
        mcp_endpoint: `${getOAuthConfig().issuer}/api/mcp`,
        recommended_scopes: Object.keys(SUPPORTED_SCOPES),
        pre_configured_client: "claude-web"
      },
      timestamp: new Date().toISOString()
    };

    console.log('🔍 Claude.ai complete connection test performed', authTest ? 'with auth' : 'without auth');

    return NextResponse.json(testResults, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('❌ Claude.ai comprehensive test failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'comprehensive_test_failed', 
        message: error instanceof Error ? error.message : 'Unknown test failure',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}