/**
 * OAuth 2.1 Authorization Server Metadata Endpoint
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 */

import { NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../lib/oauth/config';
import { SUPPORTED_SCOPES } from '../../../lib/oauth/scopes';

export async function GET() {
  try {
    const config = getOAuthConfig();
    
    const metadata = {
      issuer: config.issuer,
      authorization_endpoint: `${config.issuer}/api/oauth/authorize`,
      token_endpoint: `${config.issuer}/api/oauth/token`,
      jwks_uri: `${config.issuer}/api/oauth/jwks`,
      registration_endpoint: `${config.issuer}/api/oauth/register`,
      
      // Supported response types (OAuth 2.1)
      response_types_supported: ['code'],
      
      // Supported grant types (MCP 2025-06-18 requires refresh_token)
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'client_credentials'
      ],
      
      // Supported scopes
      scopes_supported: Object.keys(SUPPORTED_SCOPES),
      
      // Supported client authentication methods
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        'client_secret_basic',
        'none' // For public clients with PKCE
      ],
      
      // PKCE support (required for OAuth 2.1)
      code_challenge_methods_supported: ['S256', 'plain'],
      
      // Token introspection and revocation
      introspection_endpoint: `${config.issuer}/api/oauth/introspect`,
      revocation_endpoint: `${config.issuer}/api/oauth/revoke`,
      
      // Resource server endpoint (where Claude.ai should make authenticated requests)
      resource_endpoint: `${config.issuer}/api/mcp`,
      protected_resource_metadata: `${config.issuer}/.well-known/oauth-protected-resource`,
      
      // Additional metadata
      response_modes_supported: ['query', 'fragment'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: [config.jwtAlgorithm],
      
      // Service documentation
      service_documentation: `${config.issuer}/docs/oauth`,
      
      // UI locales (optional)
      ui_locales_supported: ['en'],
      
      // Claims supported (minimal for this implementation)
      claims_supported: [
        'sub',
        'aud',
        'exp',
        'iat',
        'iss',
        'client_id',
        'scope'
      ]
    };

    console.log('📋 Serving OAuth 2.1 authorization server metadata');

    return NextResponse.json(metadata, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('❌ OAuth metadata endpoint error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to generate metadata' },
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}