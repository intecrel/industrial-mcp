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
import { validateCSRFToken } from '../../../../lib/security/csrf';
import { withRateLimit, RATE_LIMITS, markSuccessfulRequest } from '../../../../lib/security/rate-limiter';
import { createAuditLogger, logOAuthConsent, logSecurityViolation, AuditEventType } from '../../../../lib/security/audit-logger';
import { addConsentGrant } from '../../../../lib/oauth/consent-grants-api';

async function consentHandler(request: NextRequest): Promise<Response> {
  try {
    // CRITICAL: Verify user is authenticated before processing consent
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      console.error('🚨 SECURITY: Unauthenticated consent attempt blocked');
      logSecurityViolation(request, 'Unauthenticated consent attempt', {
        endpoint: '/api/auth/consent',
        method: 'POST'
      });
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
      approved,
      _csrf_token,
      _csrf_expires
    } = body;

    // Validate CSRF token
    const csrfHeader = request.headers.get('x-csrf-token');
    
    if (!csrfHeader || !_csrf_token || !_csrf_expires) {
      console.error('🚨 SECURITY: CSRF validation failed - missing tokens');
      logSecurityViolation(request, 'CSRF tokens missing', {
        endpoint: '/api/auth/consent',
        user_email: session.user.email
      }, session.user);
      return NextResponse.json({
        error: 'csrf_required',
        error_description: 'CSRF protection required'
      }, { status: 403 });
    }
    
    const csrfValidation = validateCSRFToken(csrfHeader, _csrf_token, _csrf_expires);
    
    if (!csrfValidation.valid) {
      console.error('🚨 SECURITY: CSRF validation failed:', csrfValidation.error);
      logSecurityViolation(request, 'CSRF validation failed', {
        endpoint: '/api/auth/consent',
        error: csrfValidation.error,
        user_email: session.user.email
      }, session.user);
      return NextResponse.json({
        error: 'csrf_invalid',
        error_description: csrfValidation.error || 'Invalid CSRF token'
      }, { status: 403 });
    }
    
    console.log('🛡️ CSRF token validated successfully');

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

    // Validate scopes first (needed for both approval and denial logging)
    const scopeValidation = validateScopes(scope);
    if (!scopeValidation.valid) {
      return createConsentErrorRedirect(
        redirect_uri,
        'invalid_scope',
        scopeValidation.errors.join(', '),
        state
      );
    }

    // Handle denial
    if (!approved) {
      console.log(`❌ User denied authorization for client: ${client.client_name}`);
      
      // Log consent denial
      logOAuthConsent(
        request,
        session.user,
        client_id,
        false,
        scopeValidation.scopes,
        session.user.id || session.user.email || 'unknown'
      );
      
      return createConsentErrorRedirect(
        redirect_uri,
        'access_denied',
        'User denied the authorization request',
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

      // Add consent grant record for user management
      const grantId = await addConsentGrant(
        session.user.email!,
        client_id,
        client.client_name,
        scopeValidation.scopes,
        session.user.id
      );
      
      console.log(`✅ User approved authorization for client: ${client.client_name}`);
      console.log(`📝 Consent grant recorded: ${grantId}`);
      console.log(`🔑 Authorization code issued: ${authCode.substring(0, 8)}...`);

      // Log successful consent and token issuance
      logOAuthConsent(
        request,
        session.user,
        client_id,
        true,
        scopeValidation.scopes,
        session.user.id || session.user.email || 'unknown'
      );
      
      const logger = createAuditLogger(request, session.user, session.user.id || session.user.email || undefined);
      logger.logOAuthEvent(
        AuditEventType.OAUTH_TOKEN_ISSUED,
        `Authorization code issued for client ${client.client_name}`,
        client_id,
        'success',
        {
          scopes: scopeValidation.scopes,
          code_challenge_method,
          redirect_uri,
          auth_code_preview: authCode.substring(0, 8) + '...'
        },
        'medium'
      );

      // Mark as successful request for rate limiting
      markSuccessfulRequest(request);

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

// Export rate-limited handler
export const POST = withRateLimit(RATE_LIMITS.OAUTH_CONSENT, consentHandler);