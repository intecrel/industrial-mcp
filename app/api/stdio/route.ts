/**
 * Stdio Transport Endpoint
 * Handles standard input/output communication for MCP bridge scripts
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, getAuthInfo } from '../../../lib/oauth/auth-middleware';
import { applyCORSHeaders } from '../../../lib/security/cors-config';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse the JSON-RPC request from stdio bridge
    const jsonRpcRequest = await request.json();
    
    console.log('📡 Stdio transport request:', jsonRpcRequest.method);

    // Authenticate the request (supports dual authentication)
    let authContext;
    try {
      authContext = await authenticateRequest(request);
      console.log(`✅ Stdio auth success: ${getAuthInfo(authContext)}`);
    } catch (authError) {
      console.error('❌ Stdio authentication failed:', authError);
      return NextResponse.json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Authentication failed",
          data: {
            error: "authentication_required",
            details: authError instanceof Error ? authError.message : "Unknown auth error"
          }
        },
        id: jsonRpcRequest.id || null
      }, { status: 401 });
    }

    // Forward the request to the main MCP handler
    // Create a new request object for the MCP endpoint
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

    // Forward to the MCP endpoint directly
    const mcpResponse = await fetch(mcpRequest);

    // Handle different response types
    if (mcpResponse.headers.get('content-type')?.includes('text/event-stream')) {
      // Handle streaming response (SSE format)
      const responseText = await mcpResponse.text();
      const lines = responseText.split('\n');
      const dataLine = lines.find(line => line.startsWith('data: '));
      
      if (dataLine) {
        const jsonData = JSON.parse(dataLine.substring(6));
        const duration = Date.now() - startTime;
        console.log(`📡 Stdio response processed (${duration}ms)`);
        
        return NextResponse.json(jsonData, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } else {
        throw new Error('No data found in streaming response');
      }
    } else {
      // Handle direct JSON response
      const jsonData = await mcpResponse.json();
      const duration = Date.now() - startTime;
      console.log(`📡 Stdio response processed (${duration}ms)`);
      
      return NextResponse.json(jsonData, {
        status: mcpResponse.status,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Stdio transport error (${duration}ms):`, error);
    
    // Return JSON-RPC error response
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Stdio transport error",
        data: {
          error: "transport_error",
          details: error instanceof Error ? error.message : "Unknown transport error"
        }
      },
      id: null
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}

// Also support GET for basic connectivity tests
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      transport: "stdio",
      status: "operational",
      description: "Stdio transport endpoint for MCP bridge scripts",
      endpoint: `${request.nextUrl.origin}/api/stdio`,
      method: "POST",
      format: "JSON-RPC 2.0",
      authentication: ["OAuth 2.1 Bearer Token", "API Key + MAC Address"],
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (error) {
    console.error('❌ Stdio GET error:', error);
    return NextResponse.json(
      { error: 'stdio_info_error', message: 'Failed to get stdio transport info' },
      { status: 500 }
    );
  }
}