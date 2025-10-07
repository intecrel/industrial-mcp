/**
 * Root MCP request handler
 * Extracted from /app/api/route.ts to be used by [transport] route
 * when handling root API requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyCORSHeaders } from '../../lib/security/cors-config';

export async function handleRootRequest(request: Request): Promise<Response> {
  // Convert Request to NextRequest-like object for compatibility
  const nextRequest = request as unknown as NextRequest;
  console.log('🔄 ROOT HANDLER - Processing request');
  
  if (request.method === 'GET') {
    return handleRootGET(nextRequest);
  } else if (request.method === 'POST') {
    return handleRootPOST(nextRequest);
  } else if (request.method === 'OPTIONS') {
    return handleRootOPTIONS(nextRequest);
  } else {
    const response = NextResponse.json({
      message: "Method not allowed"
    }, {
      status: 405,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    applyCORSHeaders(nextRequest, response, process.env.NODE_ENV as any);
    return response;
  }
}

async function handleRootGET(nextRequest: NextRequest): Promise<Response> {
  const request = nextRequest;
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
  
  // If Claude.ai has completed OAuth (has Bearer token), provide MCP discovery response
  if (hasBearer && isClaudeAI) {
    console.log('🔄 Claude.ai has Bearer token - providing MCP discovery response');
    
    // Return discovery information that tells Claude.ai this is the MCP endpoint
    return NextResponse.json({
      // Standard MCP discovery format
      protocol_version: "2025-06-18",
      server_name: "Industrial MCP Server",
      server_version: "2.0.0",
      
      // Tell Claude.ai the correct MCP endpoint
      mcp_endpoint: `${baseUrl}/api/mcp`,
      authentication: {
        type: "bearer_token",
        required: true
      },
      
      // Transport information
      transports: [
        {
          type: "http",
          url: `${baseUrl}/api/mcp`,
          methods: ["GET", "POST", "OPTIONS"],
          authentication: "bearer"
        }
      ],
      
      instructions: "Use /api/mcp endpoint for MCP JSON-RPC calls with Bearer token authentication"
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // Provide comprehensive MCP server discovery information
  const mcpDiscovery = {
    // MCP Protocol information
    protocol_version: "2025-06-18",
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

async function handleRootPOST(nextRequest: NextRequest): Promise<Response> {
  const request = nextRequest;
  // Handle POST requests that might be MCP calls to the root
  console.log('🔄 ROOT HANDLER POST request received - checking if this is MCP call');
  console.log('🔍 ROOT HANDLER - URL:', request.url);
  console.log('🔍 ROOT HANDLER - pathname:', request.nextUrl.pathname);
  
  const baseUrl = request.nextUrl.origin;
  const authHeader = request.headers.get('authorization');
  const hasBearer = authHeader && authHeader.startsWith('Bearer ');

  console.log(`📋 POST to root - Bearer token: ${hasBearer ? 'present' : 'missing'}`);
  console.log(`📋 Request headers:`, {
    'content-type': request.headers.get('content-type'),
    'user-agent': request.headers.get('user-agent'),
    'accept': request.headers.get('accept'),
    'origin': request.headers.get('origin')
  });

  // Check if this is an MCP request body
  try {
    // Clone the request to avoid consuming the body stream
    const requestClone = request.clone();
    const bodyText = await requestClone.text();
    console.log(`📋 POST body received: ${bodyText.substring(0, 200)}${bodyText.length > 200 ? '...' : ''}`);
    
    if (!bodyText.trim()) {
      console.log('⚠️ Empty POST body received');
      throw new Error('Empty body');
    }

    const body = JSON.parse(bodyText);
    console.log(`📋 Parsed JSON body:`, { jsonrpc: body?.jsonrpc, method: body?.method, id: body?.id });
    
    if (body && body.jsonrpc === "2.0") {
      console.log(`📡 MCP JSON-RPC call detected: ${body.method || 'unknown method'}`);
      
      // Forward MCP calls to the correct endpoint with authentication
      console.log(`🔄 Forwarding MCP call to /api/mcp (auth: ${hasBearer ? 'Bearer token' : 'anonymous'})`);
      
      // Forward the request to the actual MCP endpoint with all necessary headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': request.headers.get('accept') || 'application/json, text/event-stream',
        'User-Agent': request.headers.get('user-agent') || 'MCP-Proxy'
      };
      
      // Include Bearer token if present (optional)
      if (hasBearer) {
        headers['Authorization'] = authHeader;
      }
      
      console.log(`📋 Forwarding headers:`, Object.keys(headers));
      
      try {
        const mcpResponse = await fetch(`${baseUrl}/api/mcp`, {
          method: 'POST',
          headers,
          body: bodyText // Use original body text
        });
        
        const responseData = await mcpResponse.text();
        console.log(`✅ Proxied MCP call: ${body.method} - Status: ${mcpResponse.status}`);
        console.log(`📋 Response data: ${responseData.substring(0, 200)}${responseData.length > 200 ? '...' : ''}`);
        
        const response = new Response(responseData, {
          status: mcpResponse.status,
          headers: {
            'Content-Type': mcpResponse.headers.get('Content-Type') || 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        applyCORSHeaders(nextRequest, response, process.env.NODE_ENV as any);
        return response;
      } catch (fetchError) {
        console.error('❌ Error forwarding to /api/mcp:', fetchError);
        throw fetchError;
      }
    } else {
      console.log(`📝 Not an MCP request - jsonrpc: ${body?.jsonrpc}, method: ${body?.method}`);
    }
  } catch (error) {
    console.error('❌ Error processing POST request to root:', error);
    console.log('📝 Non-JSON or invalid POST request to root');
  }

  // Fallback for non-MCP POST requests
  console.log('⚠️ POST request to root was not a valid MCP JSON-RPC call');
  
  // Check if this might be a Claude.ai request that should be redirected
  const userAgent = request.headers.get('user-agent') || '';
  const isClaudeAI = userAgent.toLowerCase().includes('claude') || 
                     userAgent.toLowerCase().includes('anthropic');
  
  if (isClaudeAI && hasBearer) {
    console.log('🔄 Claude.ai POST with Bearer token - suggesting /api/mcp endpoint');
    const response = NextResponse.json({
      error: "MCP calls should use JSON-RPC 2.0 format",
      suggestion: "This endpoint accepts MCP JSON-RPC calls with Bearer token",
      alternative_endpoint: `${baseUrl}/api/mcp`,
      example: {
        jsonrpc: "2.0",
        method: "initialize",
        params: {},
        id: 1
      }
    }, {
      status: 400,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    applyCORSHeaders(nextRequest, response, process.env.NODE_ENV as any);
    return response;
  }
  
  const response = NextResponse.json({
    message: "Use GET for MCP discovery or POST with JSON-RPC 2.0 format"
  }, {
    status: 405,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}

async function handleRootOPTIONS(nextRequest: NextRequest): Promise<Response> {
  const request = nextRequest;
  const response = new Response(null, {
    status: 204,
    headers: {}
  });
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}