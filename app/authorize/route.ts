/**
 * OAuth Authorization Endpoint Redirect
 * Some MCP clients expect /authorize instead of /api/oauth/authorize
 * This redirect ensures compatibility with different client implementations
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;
  const searchParams = request.nextUrl.searchParams;
  
  // Redirect to the actual OAuth authorize endpoint
  const redirectUrl = new URL(`${baseUrl}/api/oauth/authorize`);
  
  // Preserve all query parameters
  searchParams.forEach((value, key) => {
    redirectUrl.searchParams.set(key, value);
  });
  
  console.log(`🔄 Redirecting /authorize to /api/oauth/authorize`);
  console.log(`📋 Query params: ${searchParams.toString()}`);
  console.log(`📋 Redirect URL: ${redirectUrl.toString()}`);
  
  return NextResponse.redirect(redirectUrl.toString(), 307);
}