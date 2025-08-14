/**
 * Root MCP Discovery Endpoint
 * This endpoint helps Claude.ai discover MCP capabilities after OAuth completion
 * It serves as a bridge between OAuth discovery and MCP endpoint location
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;
  
  console.log('🔍 Root MCP discovery endpoint called');
  console.log(`📋 Origin: ${baseUrl}`);
  console.log(`📋 User-Agent: ${request.headers.get('user-agent')}`);
  
  // Check if this looks like a Claude.ai request
  const userAgent = request.headers.get('user-agent') || '';
  const isClaudeAI = userAgent.toLowerCase().includes('claude') || 
                     userAgent.toLowerCase().includes('anthropic');
  
  if (isClaudeAI) {
    console.log('🤖 Claude.ai MCP discovery detected');
  }
  
  // Provide comprehensive MCP server discovery information
  const mcpDiscovery = {
    // MCP Protocol information
    protocol_version: "2025-03-26",
    server_name: "Industrial MCP Server",
    server_version: "2.0.0",
    
    // OAuth integration - tell Claude.ai this server supports OAuth
    authentication: {
      oauth2: {
        enabled: true,
        authorization_endpoint: `${baseUrl}/.well-known/oauth-authorization-server`,
        protected_resource_metadata: `${baseUrl}/.well-known/oauth-protected-resource`
      },
      // Also support legacy API key method
      api_key: {
        enabled: true,
        headers: ["x-api-key", "x-mac-address"]
      }
    },
    
    // MCP Endpoint locations (this is key!)
    mcp_endpoints: {
      primary: `${baseUrl}/api/mcp`,
      sse: `${baseUrl}/api/sse`,
      stdio: `${baseUrl}/api/stdio`
    },
    
    // Transport information
    transports: [
      {
        type: "http",
        url: `${baseUrl}/api/mcp`,
        methods: ["GET", "POST", "OPTIONS"],
        authentication: "bearer" // OAuth Bearer token
      },
      {
        type: "sse", 
        url: `${baseUrl}/api/sse`,
        methods: ["GET", "POST"],
        authentication: "bearer"
      }
    ],
    
    // Capabilities preview (so Claude.ai knows what to expect)
    capabilities_preview: {
      tools: 18,
      databases: ["Neo4j Knowledge Graph", "MySQL Analytics"],
      features: ["Cross-database queries", "Industrial data", "Web analytics"]
    },
    
    // Discovery instructions for Claude.ai
    instructions: {
      oauth_flow: "Complete OAuth 2.1 flow at base URL, then use Bearer token at mcp_endpoints.primary",
      api_key_fallback: "Alternatively, use x-api-key + x-mac-address headers directly at mcp endpoints"
    },
    
    timestamp: new Date().toISOString()
  };
  
  return NextResponse.json(mcpDiscovery, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-api-key, x-mac-address',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    }
  });
}

export async function POST(request: NextRequest) {
  // Handle POST requests that might be MCP calls to the root
  console.log('🔄 POST request to root - redirecting to MCP endpoint');
  
  // Check if this is an MCP request body
  try {
    const body = await request.json();
    if (body && body.jsonrpc === "2.0") {
      console.log(`📡 MCP JSON-RPC call detected: ${body.method || 'unknown method'}`);
      console.log('🔀 Suggesting client use /api/mcp endpoint directly');
      
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32000,
          message: "MCP endpoint moved",
          data: {
            suggestion: "Use /api/mcp endpoint for MCP calls",
            mcp_endpoint: `${request.nextUrl.origin}/api/mcp`,
            authentication: "Bearer token from OAuth flow"
          }
        }
      }, {
        status: 200, // Don't return error status, just redirect in MCP response
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    console.log('📝 Non-JSON POST request to root');
  }
  
  // Fallback for non-MCP POST requests
  return NextResponse.json({
    message: "Use GET for MCP discovery or POST to /api/mcp for MCP calls"
  }, {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-api-key, x-mac-address',
      'Access-Control-Max-Age': '86400'
    }
  });
}