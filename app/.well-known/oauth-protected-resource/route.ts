/**
 * OAuth 2.0 Protected Resource Metadata for MCP Server
 * RFC 8707 - Resource Indicators for OAuth 2.0
 * Required by MCP Authorization Specification
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../lib/oauth/config';

export async function GET(request: NextRequest) {
  try {
    const config = getOAuthConfig();
    
    // MCP Protected Resource Metadata according to RFC 8707
    const protectedResourceMetadata = {
      // Resource server identifier (canonical URI of this MCP server)
      resource: config.issuer,
      
      // Authorization server that issues tokens for this resource
      authorization_servers: [config.issuer],
      
      // Scopes supported by this protected resource
      scopes_supported: config.supportedScopes,
      
      // Token introspection endpoint (optional)
      introspection_endpoint: `${config.issuer}/api/oauth/introspect`,
      
      // Supported authentication methods for accessing this resource
      resource_documentation: `${config.issuer}/docs/mcp-authorization`,
      
      // MCP-specific metadata
      mcp: {
        version: "2025-06-18",
        transport: "http",
        features: {
          tools: true,
          resources: true,
          prompts: true
        }
      }
    };
    
    console.log('📋 Serving MCP Protected Resource Metadata');
    
    return NextResponse.json(protectedResourceMetadata, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      }
    });
    
  } catch (error) {
    console.error('❌ Error serving protected resource metadata:', error);
    
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Unable to serve protected resource metadata'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}