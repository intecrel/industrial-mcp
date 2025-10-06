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
    const refresh_token = body.refresh_token;

    console.log(`🔍 Token request: grant_type=${grant_type}, client_id=${client_id}`);

    // Validate grant type
    if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
      console.log(`❌ Invalid grant_type: ${grant_type}`);
      return createErrorResponse('unsupported_grant_type', 'Only authorization_code and refresh_token grants are supported');
    }
    
    // Validate required parameters based on grant type
    if (!client_id) {
      console.log('❌ Missing client_id parameter');
      return createErrorResponse('invalid_request', 'Missing client_id parameter');
    }

    if (grant_type === 'authorization_code' && !code) {
      console.log('❌ Missing code parameter for authorization_code grant');
      return createErrorResponse('invalid_request', 'Missing code parameter');
    }

    if (grant_type === 'refresh_token' && !refresh_token) {
      console.log('❌ Missing refresh_token parameter for refresh_token grant');
      return createErrorResponse('invalid_request', 'Missing refresh_token parameter');
    }
    
    // Authenticate client - with fallback for Claude.ai dynamic registration
    let client;
    try {
      client = await authenticateClient(client_id, client_secret);
    } catch (error) {
      // If dynamic client not found, check if it's Claude.ai and use pre-registered client
      if (redirect_uri === 'https://claude.ai/api/mcp/auth_callback') {
        console.log(`🔄 Dynamic client ${client_id} not found in token endpoint, using pre-registered claude-web client`);
        try {
          client = await authenticateClient('claude-web', client_secret);
        } catch (fallbackError) {
          return createErrorResponse('invalid_client', fallbackError instanceof Error ? fallbackError.message : 'Client authentication failed');
        }
      } else {
        return createErrorResponse('invalid_client', error instanceof Error ? error.message : 'Client authentication failed');
      }
    }

    // Handle refresh_token grant type (MCP 2025-06-18 spec)
    if (grant_type === 'refresh_token') {
      try {
        const refreshClaims = await validateToken(refresh_token);
        console.log(`✅ Refresh token decoded: client_id=${refreshClaims.client_id}, scope=${refreshClaims.scope}`);

        // Verify it's a refresh token
        if (refreshClaims.token_type !== 'refresh_token') {
          return createErrorResponse('invalid_grant', 'Invalid token type');
        }

        // Verify the refresh token was issued to the requesting client
        if (refreshClaims.client_id !== client.client_id) {
          console.log(`❌ Client ID mismatch: refresh token issued to ${refreshClaims.client_id}, request from ${client.client_id}`);
          return createErrorResponse('invalid_grant', 'Refresh token was not issued to this client');
        }

        // Check if refresh token is revoked
        if (refreshClaims.jti) {
          const { isRefreshTokenRevoked } = await import('../../../../lib/oauth/token-blacklist');
          if (await isRefreshTokenRevoked(refreshClaims.jti)) {
            return createErrorResponse('invalid_grant', 'Refresh token has been revoked');
          }
        }

        // Parse and validate scopes
        const scopes = refreshClaims.scope.split(' ').filter(s => s.length > 0);
        const scopeValidation = validateScopes(refreshClaims.scope);
        if (!scopeValidation.valid) {
          return createErrorResponse('invalid_scope', scopeValidation.errors.join(', '));
        }

        // Generate new access token with rotated refresh token
        const { generateRefreshToken } = await import('../../../../lib/oauth/jwt');
        const newRefreshToken = await generateRefreshToken(
          client.client_id,
          scopeValidation.scopes,
          refreshClaims.user_email,
          refreshClaims.jti // Revoke old refresh token
        );

        const tokenResponse = await generateAccessToken(
          client.client_id,
          scopeValidation.scopes,
          refreshClaims.user_email,
          false // Don't include refresh token here
        );

        // Add the new rotated refresh token
        tokenResponse.refresh_token = newRefreshToken;

        console.log(`✅ Access token refreshed for client: ${client.client_name} (refresh token rotated)`);

        return NextResponse.json(tokenResponse, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Pragma': 'no-cache'
          }
        });

      } catch (error) {
        console.error('❌ Refresh token validation failed:', error);
        return createErrorResponse('invalid_grant', error instanceof Error ? error.message : 'Invalid refresh token');
      }
    }

    // Handle authorization_code grant type
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
      // Generate access token with refresh token (MCP 2025-06-18 spec)
      const tokenResponse = await generateAccessToken(
        client.client_id,
        scopeValidation.scopes,
        authClaims.user_email,
        true // Include refresh token for initial authorization
      );

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