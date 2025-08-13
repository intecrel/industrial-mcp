/**
 * OAuth 2.1 Authorization Server Metadata Endpoint
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 */

import { NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../../lib/oauth/config';
import { getScopeDescriptions } from '../../../../lib/oauth/scopes';

export async function GET() {
  try {
    const config = getOAuthConfig();
    const scopeDescriptions = getScopeDescriptions();
    
    const metadata = {
      issuer: config.issuer,
      authorization_endpoint: config.authorizationEndpoint,
      token_endpoint: config.tokenEndpoint,
      jwks_uri: config.jwksEndpoint,
      registration_endpoint: config.registrationEndpoint,
      
      // Supported response types
      response_types_supported: ['code'],
      
      // Supported grant types
      grant_types_supported: ['authorization_code'],
      
      // Supported scopes
      scopes_supported: config.supportedScopes,
      
      // Token endpoint authentication methods
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      
      // Code challenge methods (PKCE)
      code_challenge_methods_supported: ['S256', 'plain'],
      
      // Response modes
      response_modes_supported: ['query', 'fragment'],
      
      // Subject types
      subject_types_supported: ['public'],
      
      // ID Token signing algorithms (not used for pure OAuth)
      id_token_signing_alg_values_supported: ['none'],
      
      // Additional metadata
      service_documentation: `${config.issuer}/docs`,
      op_policy_uri: `${config.issuer}/privacy`,
      op_tos_uri: `${config.issuer}/terms`,
      
      // Custom Industrial MCP metadata
      industrial_mcp: {
        version: '2.0.0',
        tools_count: 18,
        databases: ['Neo4j', 'MySQL/Cloud SQL'],
        scope_descriptions: scopeDescriptions,
        supported_clients: ['claude-desktop', 'claude-web', 'custom']
      }
    };
    
    console.log('📄 OAuth authorization server metadata requested');
    
    return NextResponse.json(metadata, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('❌ Error serving OAuth metadata:', error);
    
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to retrieve authorization server metadata'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}