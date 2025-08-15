/**
 * Root Endpoint Handler for Claude.ai MCP Discovery
 * Handles POST requests to the root / path when Claude.ai tries to connect there
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyCORSHeaders } from '../lib/security/cors-config';

export async function POST(request: NextRequest) {
  console.log('🚨 === ROOT ENDPOINT POST REQUEST DETECTED ===');
  
  const userAgent = request.headers.get('user-agent') || '';
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  const contentType = request.headers.get('content-type') || '';
  const acceptHeader = request.headers.get('accept') || '';
  const authHeader = request.headers.get('authorization') || '';
  
  console.log(`🔍 Root POST Request Details:`);
  console.log(`   📋 User-Agent: ${userAgent}`);
  console.log(`   📋 Client IP: ${clientIP}`);
  console.log(`   📋 Content-Type: ${contentType}`);
  console.log(`   📋 Accept: ${acceptHeader}`);
  console.log(`   📋 Authorization: ${authHeader ? 'Bearer token present' : 'No auth header'}`);
  console.log(`   📋 URL: ${request.url}`);
  console.log(`   📋 Method: ${request.method}`);
  
  // Check if this looks like a Claude.ai request
  const isClaudeAI = userAgent.toLowerCase().includes('claude') || 
                     userAgent.toLowerCase().includes('anthropic') ||
                     userAgent.includes('Claude-User');
  
  if (isClaudeAI) {
    console.log('🤖 CLAUDE.AI REQUEST DETECTED at root endpoint!');
  }
  
  // Try to parse the request body to see if it's an MCP call
  let requestBody: any = null;
  try {
    const body = await request.text();
    console.log(`📝 Request Body: ${body}`);
    
    if (body) {
      requestBody = JSON.parse(body);
      console.log(`📡 Parsed JSON: ${JSON.stringify(requestBody, null, 2)}`);
      
      if (requestBody && requestBody.jsonrpc === "2.0") {
        console.log(`🔧 MCP JSON-RPC call detected at root: ${requestBody.method || 'unknown method'}`);
        
        // Redirect Claude.ai to the correct MCP endpoint
        const baseUrl = request.nextUrl.origin;
        console.log(`🔄 Redirecting Claude.ai to ${baseUrl}/api`);
        
        // Forward the request to /api endpoint
        const response = await fetch(`${baseUrl}/api`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': acceptHeader || 'application/json, text/event-stream',
            'User-Agent': userAgent || 'Claude-Redirect',
            ...(authHeader && { 'Authorization': authHeader })
          },
          body: JSON.stringify(requestBody)
        });
        
        const responseData = await response.text();
        console.log(`✅ Redirected MCP call from root to /api - Status: ${response.status}`);
        
        const finalResponse = new Response(responseData, {
          status: response.status,
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        applyCORSHeaders(request, finalResponse, process.env.NODE_ENV as any);
        return finalResponse;
      }
    }
  } catch (error) {
    console.log(`❌ Error parsing request body: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // For non-MCP requests, provide helpful information
  const response = NextResponse.json({
    message: "Industrial MCP Server",
    suggestion: "For MCP requests, use /api endpoint",
    mcp_endpoint: `${request.nextUrl.origin}/api`,
    oauth_metadata: `${request.nextUrl.origin}/.well-known/oauth-authorization-server`,
    discovered_at: new Date().toISOString(),
    user_agent: userAgent,
    is_claude_ai: isClaudeAI
  }, {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  console.log('🚨 === END ROOT ENDPOINT POST REQUEST ===');
  return response;
}

export async function GET(request: NextRequest) {
  // Redirect GET requests to the main page
  console.log('🔄 GET request to root - redirecting to main page');
  return NextResponse.redirect(new URL('/', request.url), 302);
}

export async function OPTIONS(request: NextRequest) {
  console.log('🔧 OPTIONS request to root endpoint');
  const response = NextResponse.json({}, { status: 200 });
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}