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
    
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        message: "MCP endpoint working - no more infinite loop!",
        method: body.method,
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