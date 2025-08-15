/**
 * OAuth 2.1 Protected Resource Server Metadata Endpoint
 * Based on RFC 8414 (OAuth 2.0 Authorization Server Metadata) 
 * Extended for MCP resource server metadata
 */

import { NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../lib/oauth/config';

export async function GET() {
  try {
    const config = getOAuthConfig();
    
    // Standard OAuth 2.0 Resource Server Metadata (based on RFC 8414 principles)
    const metadata = {
      // Resource server identifier (standard)
      resource: config.issuer,
      
      // Authorization servers that can issue tokens for this resource (standard)
      authorization_servers: [config.issuer],
      
      // Supported scopes for this resource server (standard)  
      scopes_supported: config.supportedScopes,
      
      // Token introspection endpoint (RFC 7662)
      introspection_endpoint: `${config.issuer}/api/oauth/introspect`,
      
      // Bearer token usage methods (standard)
      bearer_methods_supported: ['header'],
      
      // Token endpoint authentication methods (standard)
      token_endpoint_auth_methods_supported: [
        'client_secret_basic',
        'client_secret_post',
        'private_key_jwt'
      ],
      
      // Response types supported (standard)
      response_types_supported: ['code'],
      
      // Grant types supported (standard) 
      grant_types_supported: [
        'authorization_code',
        'client_credentials'
      ],
      
      // MCP-specific extensions (non-standard but clearly marked)
      mcp_extensions: {
        protocol_version: '2025-03-26',
        server_info: {
          name: 'Industrial MCP Server',
          version: '2.0.0'
        },
        endpoints: {
          mcp: `${config.issuer}/api/mcp`,
          sse: `${config.issuer}/api/sse`,
          stdio: `${config.issuer}/api/stdio`
        },
        capabilities: {
          tools: 18,
          resources: true,
          prompts: true
        },
        databases: [
          'Neo4j Knowledge Graph',
          'MySQL Analytics (Matomo)'
        ]
      }
    };
    
    console.log('📋 Serving MCP Protected Resource Metadata');
    
    return NextResponse.json(metadata, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('❌ Error serving protected resource metadata:', error);
    
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to retrieve protected resource metadata'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}