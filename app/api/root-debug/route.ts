/**
 * Debug endpoint to capture and log Claude.ai root endpoint attempts
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyCORSHeaders } from '../../../lib/security/cors-config';

export async function POST(request: NextRequest) {
  console.log('🚨 === ROOT DEBUG ENDPOINT - CLAUDE.AI POST DETECTED ===');
  
  const userAgent = request.headers.get('user-agent') || '';
  const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
  const contentType = request.headers.get('content-type') || '';
  const acceptHeader = request.headers.get('accept') || '';
  const authHeader = request.headers.get('authorization') || '';
  
  console.log(`🔍 Root Debug Request Details:`);
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
    console.log('🤖 CLAUDE.AI REQUEST CONFIRMED!');
  }
  
  // Try to parse the request body 
  let requestBody: any = null;
  try {
    const body = await request.text();
    console.log(`📝 Request Body: ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`);
    
    if (body) {
      requestBody = JSON.parse(body);
      console.log(`📡 Parsed JSON: ${JSON.stringify(requestBody, null, 2)}`);
    }
  } catch (error) {
    console.log(`❌ Error parsing request body: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Always redirect to the correct MCP endpoint
  const baseUrl = request.nextUrl.origin;
  console.log(`🔄 Redirecting to correct MCP endpoint: ${baseUrl}/api`);
  
  const response = NextResponse.json({
    message: "Claude.ai request detected and logged",
    redirect_to: `${baseUrl}/api`,
    discovered_claude_ai: isClaudeAI,
    user_agent: userAgent,
    timestamp: new Date().toISOString()
  }, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Location': `${baseUrl}/api`
    }
  });
  
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  console.log('🚨 === END ROOT DEBUG ENDPOINT ===');
  return response;
}

export async function GET(request: NextRequest) {
  console.log('🔄 GET request to root debug endpoint');
  const response = NextResponse.json({
    message: "Root debug endpoint - monitoring Claude.ai connection attempts"
  });
  applyCORSHeaders(request, response, process.env.NODE_ENV as any);
  return response;
}