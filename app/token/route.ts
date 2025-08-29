/**
 * OAuth Token Endpoint Redirect
 * Some MCP clients expect /token instead of /api/oauth/token
 * This redirect ensures compatibility with different client implementations
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;
  const body = await request.text();
  
  console.log(`🔄 Redirecting /token POST to /api/oauth/token`);
  
  // Forward the POST request to the actual token endpoint
  const response = await fetch(`${baseUrl}/api/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
      'Authorization': request.headers.get('authorization') || ''
    },
    body: body
  });
  
  const data = await response.text();
  
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}