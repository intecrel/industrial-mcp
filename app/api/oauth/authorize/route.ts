/**
 * OAuth 2.1 Authorization Endpoint
 * RFC 6749 - OAuth 2.0 Authorization Framework
 * Handles authorization code requests with PKCE support
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateClient, validateRedirectUri } from '../../../../lib/oauth/clients';
import { validateScopes } from '../../../../lib/oauth/scopes';
import { isValidCodeChallenge } from '../../../../lib/oauth/pkce';
import { getCurrentDeploymentUrl } from '../../../../lib/oauth/config';

// Force dynamic rendering for OAuth routes
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract OAuth parameters
    const response_type = searchParams.get('response_type');
    const client_id = searchParams.get('client_id');
    const redirect_uri = searchParams.get('redirect_uri');
    const scope = searchParams.get('scope') || 'mcp:tools mcp:resources mcp:prompts';
    const state = searchParams.get('state');
    const code_challenge = searchParams.get('code_challenge');
    const code_challenge_method = searchParams.get('code_challenge_method') || 'S256';
    
    // Validate required parameters
    if (response_type !== 'code') {
      return createErrorResponse('unsupported_response_type', 'Only response_type=code is supported');
    }
    
    if (!client_id) {
      return createErrorResponse('invalid_request', 'Missing client_id parameter');
    }
    
    if (!redirect_uri) {
      return createErrorResponse('invalid_request', 'Missing redirect_uri parameter');
    }
    
    // Validate client - with fallback for Claude.ai dynamic registration
    let client;
    try {
      client = await validateClient(client_id);
    } catch (error) {
      // If dynamic client not found, check if it's Claude.ai and use pre-registered client
      if (redirect_uri === 'https://claude.ai/api/mcp/auth_callback') {
        console.log(`🔄 Dynamic client ${client_id} not found, using pre-registered claude-web client`);
        try {
          client = await validateClient('claude-web');
        } catch (fallbackError) {
          return createErrorResponse('invalid_client', fallbackError instanceof Error ? fallbackError.message : 'Invalid client');
        }
      } else {
        return createErrorResponse('invalid_client', error instanceof Error ? error.message : 'Invalid client');
      }
    }
    
    // Validate redirect URI (use the actual client we're using, which might be the fallback)
    const clientIdToCheck = client.client_id;
    if (!(await validateRedirectUri(clientIdToCheck, redirect_uri))) {
      return createErrorResponse('invalid_redirect_uri', 'Invalid redirect_uri for this client');
    }
    
    // Validate scopes
    const scopeValidation = validateScopes(scope);
    if (!scopeValidation.valid) {
      return createRedirectError(redirect_uri, 'invalid_scope', scopeValidation.errors.join(', '), state);
    }
    
    // Validate PKCE (recommended for public clients)
    if (code_challenge && !isValidCodeChallenge(code_challenge)) {
      return createRedirectError(redirect_uri, 'invalid_request', 'Invalid code_challenge format', state);
    }
    
    if (code_challenge_method !== 'S256' && code_challenge_method !== 'plain') {
      return createRedirectError(redirect_uri, 'invalid_request', 'Unsupported code_challenge_method', state);
    }
    
    // Redirect to consent screen for user authorization
    try {
      // Get the current deployment URL dynamically
      const baseUrl = getCurrentDeploymentUrl();
      
      // Construct consent URL with OAuth parameters
      const consentUrl = new URL(`${baseUrl}/auth/consent`);
      consentUrl.searchParams.set('client_id', client_id);
      consentUrl.searchParams.set('client_name', client.client_name);
      consentUrl.searchParams.set('redirect_uri', redirect_uri);
      consentUrl.searchParams.set('scope', scope);
      if (state) {
        consentUrl.searchParams.set('state', state);
      }
      if (code_challenge) {
        consentUrl.searchParams.set('code_challenge', code_challenge);
      }
      if (code_challenge_method) {
        consentUrl.searchParams.set('code_challenge_method', code_challenge_method);
      }
      
      console.log(`🔐 Redirecting to consent screen for client: ${client.client_name}`);
      console.log(`📋 Consent URL: ${consentUrl.toString()}`);
      
      // Redirect to consent page
      return NextResponse.redirect(consentUrl.toString());
      
    } catch (error) {
      console.error('❌ Error redirecting to consent screen:', error);
      return createRedirectError(
        redirect_uri, 
        'server_error', 
        'Failed to redirect to consent screen',
        state || undefined
      );
    }
    
  } catch (error) {
    console.error('❌ Authorization endpoint error:', error);
    return createErrorResponse('server_error', 'Internal server error');
  }
}

/**
 * Create JSON error response
 */
function createErrorResponse(error: string, description: string): NextResponse {
  return NextResponse.json({
    error,
    error_description: description
  }, { 
    status: 400,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

/**
 * Create redirect error response
 */
function createRedirectError(
  redirectUri: string, 
  error: string, 
  description: string,
  state?: string | null | undefined
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) {
    url.searchParams.set('state', state);
  }
  
  return NextResponse.redirect(url.toString());
}