/**
 * Direct MCP endpoint route
 * This ensures /api/mcp is accessible directly for Claude.ai
 * Forwards all requests to the main [transport] handler
 */

import { NextRequest, NextResponse } from 'next/server';

// Import the handlers from the [transport] route
import { GET as TransportGET, POST as TransportPOST } from '../[transport]/route';

export async function GET(request: NextRequest) {
  console.log('🔍 Direct /api/mcp GET request received');
  console.log(`📋 User-Agent: ${request.headers.get('user-agent')}`);
  console.log(`🔐 Auth: ${request.headers.get('authorization') ? 'Bearer token present' : 'No auth header'}`);
  
  // Forward to the main transport handler
  return TransportGET(request as any);
}

export async function POST(request: NextRequest) {
  console.log('🔍 Direct /api/mcp POST request received');
  console.log(`📋 User-Agent: ${request.headers.get('user-agent')}`);
  console.log(`🔐 Auth: ${request.headers.get('authorization') ? 'Bearer token present' : 'No auth header'}`);
  
  // Forward to the main transport handler
  return TransportPOST(request as any);
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