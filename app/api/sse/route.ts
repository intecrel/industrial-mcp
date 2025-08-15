/**
 * Server-Sent Events Transport Endpoint
 * Provides streaming MCP communication via SSE
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, getAuthInfo } from '../../../lib/oauth/auth-middleware';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Check for authentication via query params (for SSE compatibility)
  const token = searchParams.get('token');
  const apiKey = searchParams.get('api_key');
  const macAddress = searchParams.get('mac_address');
  
  try {
    // DISABLED: Authentication for Claude.ai SSE compatibility
    // Allow SSE connections without authentication for Claude.ai integration
    console.log(`🔓 SSE request allowed without authentication from ${request.headers.get('x-forwarded-for') || 'unknown'}`);
    
    // Optional: Try to get auth context if available, but don't require it
    let authContext = null;
    try {
      const authHeaders = new Headers(request.headers);
      
      if (token) {
        authHeaders.set('authorization', `Bearer ${token}`);
      } else if (apiKey && macAddress) {
        authHeaders.set('x-api-key', apiKey);
        authHeaders.set('x-mac-address', macAddress);
      }
      
      if (token || (apiKey && macAddress)) {
        const authRequest = new NextRequest(request.url, {
          method: request.method,
          headers: authHeaders,
        });
        
        authContext = await authenticateRequest(authRequest);
        console.log(`✅ Optional SSE auth success: ${getAuthInfo(authContext)}`);
      } else {
        console.log(`🔓 No SSE authentication provided - proceeding with anonymous access`);
      }
    } catch (authError) {
      // Don't fail the request, just log and proceed anonymously
      console.log(`⚠️ Optional SSE authentication failed, proceeding anonymously: ${authError instanceof Error ? authError.message : String(authError)}`);
    }

    // Create SSE response stream
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection event
        const connectionEvent = `event: connected\ndata: ${JSON.stringify({
          status: "connected",
          server: "Industrial MCP Server",
          transport: "sse",
          auth_method: authContext?.method || "anonymous",
          user_id: authContext?.userId || "anonymous",
          timestamp: new Date().toISOString()
        })}\n\n`;
        
        controller.enqueue(new TextEncoder().encode(connectionEvent));

        // Send available tools
        const toolsEvent = `event: tools\ndata: ${JSON.stringify({
          type: "tools_available",
          message: "MCP tools are available via POST requests",
          endpoint: `${request.nextUrl.origin}/api/mcp`,
          supported_methods: ["tools/list", "tools/call"],
          authentication: authContext?.method || "anonymous",
          scopes: authContext?.scopes || [],
          permissions: authContext?.permissions || []
        })}\n\n`;
        
        controller.enqueue(new TextEncoder().encode(toolsEvent));

        // Send periodic heartbeat
        const heartbeatInterval = setInterval(() => {
          try {
            const heartbeat = `event: heartbeat\ndata: ${JSON.stringify({
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
              status: "alive"
            })}\n\n`;
            
            controller.enqueue(new TextEncoder().encode(heartbeat));
          } catch (error) {
            console.error('❌ SSE heartbeat error:', error);
            clearInterval(heartbeatInterval);
            controller.close();
          }
        }, 30000); // 30 second heartbeat

        // Handle client disconnect
        request.signal?.addEventListener('abort', () => {
          clearInterval(heartbeatInterval);
          controller.close();
          console.log('📡 SSE client disconnected');
        });

        // Send system info
        const systemEvent = `event: system\ndata: ${JSON.stringify({
          server: {
            name: "Industrial MCP Server",
            version: "1.0.0",
            mcp_version: "2024-10-07",
            uptime: process.uptime()
          },
          capabilities: {
            total_tools: 18,
            databases: ["Neo4j Knowledge Graph", "MySQL Analytics (Matomo)"],
            transports: ["HTTP", "SSE", "Stdio"]
          },
          client_info: {
            user_id: authContext?.userId || "anonymous",
            auth_method: authContext?.method || "anonymous",
            permissions: authContext?.permissions || [],
            connected_at: new Date().toISOString()
          }
        })}\n\n`;
        
        controller.enqueue(new TextEncoder().encode(systemEvent));
      }
    });

    console.log('📡 SSE connection established');

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    });

  } catch (error) {
    console.error('❌ SSE transport error:', error);
    
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        error: "sse_transport_error",
        message: error instanceof Error ? error.message : "Unknown SSE error",
        timestamp: new Date().toISOString()
      })}\n\n`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

export async function POST(request: NextRequest) {
  // For MCP tool calls via SSE, redirect to the main MCP endpoint
  try {
    const jsonRpcRequest = await request.json();
    
    console.log('📡 SSE POST request:', jsonRpcRequest.method);

    // Forward to the main MCP handler
    const mcpRequest = new Request(`${request.nextUrl.origin}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        // Forward authentication headers
        ...(request.headers.get('authorization') && {
          'Authorization': request.headers.get('authorization')!
        }),
        ...(request.headers.get('x-api-key') && {
          'x-api-key': request.headers.get('x-api-key')!
        }),
        ...(request.headers.get('x-mac-address') && {
          'x-mac-address': request.headers.get('x-mac-address')!
        })
      },
      body: JSON.stringify(jsonRpcRequest)
    });

    // Get the MCP handler
    const { POST: mcpHandler } = await import('../[transport]/route');
    const mcpResponse = await mcpHandler(mcpRequest);
    
    // Return the response as SSE format
    const jsonData = await mcpResponse.json();
    
    return new Response(
      `event: response\ndata: ${JSON.stringify(jsonData)}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );

  } catch (error) {
    console.error('❌ SSE POST error:', error);
    
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        error: "sse_post_error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      })}\n\n`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}