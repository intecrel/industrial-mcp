/**
 * OAuth 2.1 Authorization Endpoint
 * RFC 6749 - OAuth 2.0 Authorization Framework
 * Handles authorization code requests with PKCE support
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateClient, validateRedirectUri } from '../../../../lib/oauth/clients';
import { validateScopes } from '../../../../lib/oauth/scopes';
import { generateAuthorizationCode } from '../../../../lib/oauth/jwt';
import { isValidCodeChallenge } from '../../../../lib/oauth/pkce';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract OAuth parameters
    const response_type = searchParams.get('response_type');
    const client_id = searchParams.get('client_id');
    const redirect_uri = searchParams.get('redirect_uri');
    const scope = searchParams.get('scope') || 'read:analytics read:knowledge';
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
    
    // Validate client
    let client;
    try {
      client = validateClient(client_id);
    } catch (error) {
      return createErrorResponse('invalid_client', error instanceof Error ? error.message : 'Invalid client');
    }
    
    // Validate redirect URI
    if (!validateRedirectUri(client_id, redirect_uri)) {
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
    
    // For this implementation, we'll auto-approve the authorization
    // In a real implementation, this would redirect to a consent screen
    
    try {
      // Generate authorization code
      const authCode = await generateAuthorizationCode(
        client_id,
        scopeValidation.scopes,
        redirect_uri,
        code_challenge || undefined,
        code_challenge_method || undefined
      );
      
      // Construct redirect URL with authorization code
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }
      
      console.log(`✅ Authorization code issued for client: ${client.client_name}`);
      
      // Redirect back to client with authorization code
      return NextResponse.redirect(redirectUrl.toString());
      
    } catch (error) {
      console.error('❌ Error generating authorization code:', error);
      return createRedirectError(
        redirect_uri, 
        'server_error', 
        'Failed to generate authorization code',
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