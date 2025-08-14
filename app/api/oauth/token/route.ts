/**
 * OAuth 2.1 Token Endpoint
 * RFC 6749 - OAuth 2.0 Authorization Framework
 * Handles authorization code exchange for access tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateClient, validateRedirectUri } from '../../../../lib/oauth/clients';
import { validateScopes } from '../../../../lib/oauth/scopes';
import { validateToken, generateAccessToken, TokenClaims } from '../../../../lib/oauth/jwt';
import { verifyPkceChallenge, isValidCodeVerifier } from '../../../../lib/oauth/pkce';

export async function POST(request: NextRequest) {
  console.log('🔥 Token endpoint called');
  try {
    // Parse form data or JSON body
    const contentType = request.headers.get('content-type') || '';
    console.log(`🔥 Content-Type: ${contentType}`);
    let body: Record<string, string>;
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      return createErrorResponse('invalid_request', 'Unsupported content type');
    }
    
    // Extract token request parameters
    const grant_type = body.grant_type;
    const code = body.code;
    const redirect_uri = body.redirect_uri;
    const client_id = body.client_id;
    const client_secret = body.client_secret;
    const code_verifier = body.code_verifier;
    
    console.log(`🔍 Token request: grant_type=${grant_type}, client_id=${client_id}, code=${code?.substring(0, 20)}..., redirect_uri=${redirect_uri}`);
    
    // Validate grant type
    if (grant_type !== 'authorization_code') {
      console.log(`❌ Invalid grant_type: ${grant_type}`);
      return createErrorResponse('unsupported_grant_type', 'Only authorization_code grant is supported');
    }
    
    // Validate required parameters
    if (!code) {
      console.log('❌ Missing code parameter');
      return createErrorResponse('invalid_request', 'Missing code parameter');
    }
    
    if (!client_id) {
      console.log('❌ Missing client_id parameter');
      return createErrorResponse('invalid_request', 'Missing client_id parameter');
    }
    
    // Authenticate client - with fallback for Claude.ai dynamic registration
    let client;
    try {
      client = authenticateClient(client_id, client_secret);
    } catch (error) {
      // If dynamic client not found, check if it's Claude.ai and use pre-registered client
      if (redirect_uri === 'https://claude.ai/api/mcp/auth_callback') {
        console.log(`🔄 Dynamic client ${client_id} not found in token endpoint, using pre-registered claude-web client`);
        try {
          client = authenticateClient('claude-web', client_secret);
        } catch (fallbackError) {
          return createErrorResponse('invalid_client', fallbackError instanceof Error ? fallbackError.message : 'Client authentication failed');
        }
      } else {
        return createErrorResponse('invalid_client', error instanceof Error ? error.message : 'Client authentication failed');
      }
    }
    
    // Validate and decode authorization code
    let authClaims: TokenClaims;
    try {
      authClaims = await validateToken(code);
      console.log(`✅ Authorization code decoded: client_id=${authClaims.client_id}, scope=${authClaims.scope}`);
    } catch (error) {
      console.log(`❌ Authorization code validation failed: ${error instanceof Error ? error.message : 'Invalid authorization code'}`);
      return createErrorResponse('invalid_grant', error instanceof Error ? error.message : 'Invalid authorization code');
    }
    
    // Verify authorization code properties
    if (authClaims.token_type !== 'authorization_code') {
      return createErrorResponse('invalid_grant', 'Invalid code type');
    }
    
    // Verify the authorization code was issued to the requesting client or fallback client
    // For Claude.ai dynamic registration, allow either the original dynamic client_id or fallback client_id
    console.log(`🔍 Client ID validation: authClaims.client_id=${authClaims.client_id}, request client_id=${client_id}, authenticated client_id=${client.client_id}`);
    
    const isValidClientId = authClaims.client_id === client_id || 
                           authClaims.client_id === client.client_id ||
                           (redirect_uri === 'https://claude.ai/api/mcp/auth_callback' && client.client_id === 'claude-web');
    
    if (!isValidClientId) {
      console.log(`❌ Client ID mismatch: code issued to ${authClaims.client_id}, request from ${client_id}, authenticated as ${client.client_id}`);
      return createErrorResponse('invalid_grant', 'Code was not issued to this client');
    }
    
    // Validate redirect URI if present in the code
    if ('redirect_uri' in authClaims && redirect_uri !== authClaims.redirect_uri) {
      return createErrorResponse('invalid_grant', 'Redirect URI mismatch');
    }
    
    // Validate PKCE if code challenge was used
    if ('code_challenge' in authClaims && authClaims.code_challenge) {
      if (!code_verifier) {
        return createErrorResponse('invalid_request', 'Missing code_verifier for PKCE');
      }
      
      if (!isValidCodeVerifier(code_verifier)) {
        return createErrorResponse('invalid_request', 'Invalid code_verifier format');
      }
      
      const codeChallengeMethod = authClaims.code_challenge_method || 'S256';
      if (!verifyPkceChallenge(code_verifier, authClaims.code_challenge, codeChallengeMethod)) {
        return createErrorResponse('invalid_grant', 'PKCE verification failed');
      }
    }
    
    // Parse and validate scopes from the authorization code
    const scopes = authClaims.scope.split(' ').filter(s => s.length > 0);
    const scopeValidation = validateScopes(authClaims.scope);
    if (!scopeValidation.valid) {
      return createErrorResponse('invalid_scope', scopeValidation.errors.join(', '));
    }
    
    try {
      // Generate access token using the authenticated client's ID
      const tokenResponse = await generateAccessToken(client.client_id, scopeValidation.scopes);
      
      console.log(`✅ Access token issued for client: ${client.client_name} with scopes: ${scopeValidation.scopes.join(' ')}`);
      
      return NextResponse.json(tokenResponse, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache'
        }
      });
      
    } catch (error) {
      console.error('❌ Error generating access token:', error);
      return createErrorResponse('server_error', 'Failed to generate access token');
    }
    
  } catch (error) {
    console.error('❌ Token endpoint error:', error);
    return createErrorResponse('server_error', 'Internal server error');
  }
}

/**
 * Create JSON error response according to OAuth 2.1 spec
 */
function createErrorResponse(error: string, description: string): NextResponse {
  return NextResponse.json({
    error,
    error_description: description
  }, { 
    status: 400,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache'
    }
  });
}