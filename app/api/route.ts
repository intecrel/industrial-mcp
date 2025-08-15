/**
 * Root MCP Discovery Endpoint
 * This endpoint helps Claude.ai discover MCP capabilities after OAuth completion
 * It serves as a bridge between OAuth discovery and MCP endpoint location
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyCORSHeaders } from '../../lib/security/cors-config';

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
  
  // Check if this request has authorization header (Bearer token from OAuth)
  const authHeader = request.headers.get('authorization');
  const hasBearer = authHeader && authHeader.startsWith('Bearer ');
  
  console.log(`🔍 Root discovery - Auth header: ${hasBearer ? 'Bearer token present' : 'No Bearer token'}`);
  
  // If Claude.ai has completed OAuth (has Bearer token), redirect to MCP endpoint
  if (hasBearer && isClaudeAI) {
    console.log('🔄 Claude.ai has Bearer token - redirecting to MCP endpoint');
    
    // Return MCP protocol response that tells Claude.ai to use Bearer auth at /api/mcp
    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: {
          name: "Industrial MCP Server",
          version: "2.0.0"
        },
        // CRITICAL: Tell Claude.ai where to make authenticated MCP calls
        _mcp_endpoint_redirect: `${baseUrl}/api/mcp`,
        _authentication_method: "bearer_token",
        _instructions: "Use Bearer token from OAuth at /api/mcp endpoint"
      }
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Location': `${baseUrl}/api/mcp` // HTTP redirect header
      }
    });
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
        protected_resource_metadata: `${baseUrl}/.well-known/oauth-protected-resource`,
        // IMPORTANT: Tell Claude.ai to use Bearer token after OAuth
        requires_bearer_token: true,
        bearer_token_endpoint: `${baseUrl}/api/mcp`
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
  
  const response = NextResponse.json(mcpDiscovery, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    }
  });

  // Apply proper CORS headers
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}

export async function POST(request: NextRequest) {
  // Handle POST requests that might be MCP calls to the root
  console.log('🔄 POST request to root - checking if this is MCP call');
  
  const baseUrl = request.nextUrl.origin;
  const authHeader = request.headers.get('authorization');
  const hasBearer = authHeader && authHeader.startsWith('Bearer ');
  
  console.log(`📋 POST to root - Bearer token: ${hasBearer ? 'present' : 'missing'}`);
  
  // Check if this is an MCP request body
  try {
    const body = await request.json();
    if (body && body.jsonrpc === "2.0") {
      console.log(`📡 MCP JSON-RPC call detected: ${body.method || 'unknown method'}`);
      
      // DISABLED: Bearer token requirement for Claude.ai compatibility
      // Forward both authenticated and unauthenticated requests to /api/mcp
      console.log(`🔄 Forwarding MCP call to /api/mcp (auth: ${hasBearer ? 'Bearer token' : 'anonymous'})`);
      
      // Forward the request to the actual MCP endpoint
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': request.headers.get('user-agent') || 'MCP-Proxy'
      };
      
      // Include Bearer token if present (optional)
      if (hasBearer) {
        headers['Authorization'] = authHeader;
      }
      
      const mcpResponse = await fetch(`${baseUrl}/api/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      
      const responseData = await mcpResponse.text(); // Use text() for SSE responses
      console.log(`✅ Proxied MCP call: ${body.method} - Status: ${mcpResponse.status}`);
      
      const response = new Response(responseData, {
        status: mcpResponse.status,
        headers: {
          'Content-Type': mcpResponse.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      applyCORSHeaders(request, response, process.env.NODE_ENV as any);
      return response;
    }
  } catch (error) {
    console.log('📝 Non-JSON POST request to root');
  }
  
  // Fallback for non-MCP POST requests
  const response = NextResponse.json({
    message: "Use GET for MCP discovery or POST to /api/mcp for MCP calls"
  }, {
    status: 405,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}

export async function OPTIONS(request: NextRequest) {
  const response = new Response(null, {
    status: 204,
    headers: {}
  });
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}