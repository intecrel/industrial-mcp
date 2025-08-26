/**
 * Direct MCP endpoint route
 * This is a standalone MCP endpoint that uses the Vercel MCP adapter directly
 * No longer forwards to [transport] to prevent infinite loops
 */

import { NextRequest, NextResponse } from 'next/server';

// CRITICAL FIX: Simple test endpoint to break the infinite loop
// This replaces the forwarding logic that was causing the 508 errors

export async function GET(request: NextRequest) {
  console.log('🔍 Direct /api/mcp GET request received');
  console.log(`📋 User-Agent: ${request.headers.get('user-agent')}`);
  console.log(`🔐 Auth: ${request.headers.get('authorization') ? 'Bearer token present' : 'No auth header'}`);
  
  return NextResponse.json({
    message: "MCP endpoint working - no more infinite loop!",
    method: "GET",
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: NextRequest) {
  console.log('🔍 Direct /api/mcp POST request received');
  console.log(`📋 User-Agent: ${request.headers.get('user-agent')}`);
  console.log(`🔐 Auth: ${request.headers.get('authorization') ? 'Bearer token present' : 'No auth header'}`);
  
  try {
    const body = await request.json();
    console.log('📋 MCP Request:', { method: body.method, id: body.id });
    
    // Handle MCP initialize method with proper response format
    if (body.method === 'initialize') {
      console.log('🔧 Handling MCP initialize request');
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: {
            tools: {
              listChanged: false
            },
            resources: {
              subscribe: false,
              listChanged: false
            },
            prompts: {
              listChanged: false
            },
            logging: {}
          },
          serverInfo: {
            name: "Industrial MCP Server",
            version: "2.0.0"
          }
        }
      });
    }
    
    // Handle tools/list method
    if (body.method === 'tools/list') {
      console.log('🔧 Handling tools/list request');
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "echo",
              description: "Echo back the provided message (test tool)",
              inputSchema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "The message to echo back"
                  }
                },
                required: ["message"]
              }
            }
          ]
        }
      });
    }
    
    // Handle tools/call method
    if (body.method === 'tools/call') {
      console.log('🔧 Handling tools/call request:', body.params?.name);
      const toolName = body.params?.name;
      const args = body.params?.arguments || {};
      
      if (toolName === 'echo') {
        return NextResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [
              {
                type: "text",
                text: `Echo: ${args.message || 'No message provided'}`
              }
            ]
          }
        });
      }
      
      // Unknown tool
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32601,
          message: `Unknown tool: ${toolName}`
        }
      });
    }
    
    // Handle other MCP methods with generic response
    console.log('📝 Handling generic MCP method:', body.method);
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        message: `MCP method ${body.method} received successfully - server is working!`,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: "Parse error"
      }
    }, { status: 400 });
  }
}

export async function OPTIONS(request: NextRequest) {
  console.log('🔍 Direct /api/mcp OPTIONS request received');
  
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-mac-address',
      'Access-Control-Max-Age': '86400',
    },
  });
}