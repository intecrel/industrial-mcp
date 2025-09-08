/**
 * OAuth Consent Handler
 * Processes user consent and generates authorization codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth/config';
import { validateClient, validateRedirectUri } from '../../../../lib/oauth/clients';
import { validateScopes } from '../../../../lib/oauth/scopes';
import { generateAuthorizationCode } from '../../../../lib/oauth/jwt';
import { isValidCodeChallenge } from '../../../../lib/oauth/pkce';

export async function POST(request: NextRequest) {
  try {
    // CRITICAL: Verify user is authenticated before processing consent
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      console.error('🚨 SECURITY: Unauthenticated consent attempt blocked');
      return NextResponse.json({
        error: 'unauthorized',
        error_description: 'Authentication required to process consent'
      }, { status: 401 });
    }
    
    console.log(`🔐 Processing consent for authenticated user: ${session.user.email}`);
    
    const body = await request.json();
    
    const {
      client_id,
      redirect_uri,
      scope = 'mcp:tools mcp:resources mcp:prompts',
      state,
      code_challenge,
      code_challenge_method = 'S256',
      approved
    } = body;

    // Validate required parameters
    if (!client_id) {
      return NextResponse.json({
        error: 'invalid_request',
        error_description: 'Missing client_id parameter'
      }, { status: 400 });
    }

    if (!redirect_uri) {
      return NextResponse.json({
        error: 'invalid_request',
        error_description: 'Missing redirect_uri parameter'
      }, { status: 400 });
    }

    if (typeof approved !== 'boolean') {
      return NextResponse.json({
        error: 'invalid_request',
        error_description: 'Missing or invalid approved parameter'
      }, { status: 400 });
    }

    // Validate client - with fallback for Claude.ai dynamic registration
    let client;
    try {
      client = await validateClient(client_id);
    } catch (error) {
      // If dynamic client not found, check if it's Claude.ai and use pre-registered client
      if (redirect_uri === 'https://claude.ai/api/mcp/auth_callback') {
        console.log(`🔄 Dynamic client ${client_id} not found in consent handler, using pre-registered claude-web client`);
        try {
          client = await validateClient('claude-web');
        } catch (fallbackError) {
          console.error('❌ Client validation failed:', fallbackError);
          return createConsentErrorRedirect(
            redirect_uri,
            'invalid_client',
            fallbackError instanceof Error ? fallbackError.message : 'Invalid client',
            state
          );
        }
      } else {
        console.error('❌ Client validation failed:', error);
        return createConsentErrorRedirect(
          redirect_uri,
          'invalid_client',
          error instanceof Error ? error.message : 'Invalid client',
          state
        );
      }
    }

    // Validate redirect URI (use the actual client we're using, which might be the fallback)
    const clientIdToCheck = client.client_id;
    if (!(await validateRedirectUri(clientIdToCheck, redirect_uri))) {
      return NextResponse.json({
        error: 'invalid_redirect_uri',
        error_description: 'Invalid redirect_uri for this client'
      }, { status: 400 });
    }

    // Handle denial
    if (!approved) {
      console.log(`❌ User denied authorization for client: ${client.client_name}`);
      return createConsentErrorRedirect(
        redirect_uri,
        'access_denied',
        'User denied the authorization request',
        state
      );
    }

    // Validate scopes
    const scopeValidation = validateScopes(scope);
    if (!scopeValidation.valid) {
      return createConsentErrorRedirect(
        redirect_uri,
        'invalid_scope',
        scopeValidation.errors.join(', '),
        state
      );
    }

    // Validate PKCE if provided
    if (code_challenge && !isValidCodeChallenge(code_challenge)) {
      return createConsentErrorRedirect(
        redirect_uri,
        'invalid_request',
        'Invalid code_challenge format',
        state
      );
    }

    if (code_challenge_method && code_challenge_method !== 'S256' && code_challenge_method !== 'plain') {
      return createConsentErrorRedirect(
        redirect_uri,
        'invalid_request',
        'Unsupported code_challenge_method',
        state
      );
    }

    try {
      // Generate authorization code with authenticated user context
      const authCode = await generateAuthorizationCode(
        client_id,
        scopeValidation.scopes,
        redirect_uri,
        code_challenge || undefined,
        code_challenge_method || undefined,
        session.user // Include authenticated user info
      );

      // Construct redirect URL with authorization code
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }

      console.log(`✅ User approved authorization for client: ${client.client_name}`);
      console.log(`🔑 Authorization code issued: ${authCode.substring(0, 8)}...`);

      return NextResponse.json({
        redirect_url: redirectUrl.toString()
      });

    } catch (error) {
      console.error('❌ Error generating authorization code:', error);
      return createConsentErrorRedirect(
        redirect_uri,
        'server_error',
        'Failed to generate authorization code',
        state
      );
    }

  } catch (error) {
    console.error('❌ Consent endpoint error:', error);
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * Create consent error redirect response
 */
function createConsentErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state?: string | null
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) {
    url.searchParams.set('state', state);
  }

  return NextResponse.json({
    redirect_url: url.toString()
  });
}