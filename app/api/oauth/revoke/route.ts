/**
 * OAuth Token Revocation Endpoint (RFC 7009)
 * Allows users and clients to revoke access tokens and refresh tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth/config';
import { validateToken } from '../../../../lib/oauth/jwt';
import { withRateLimit, RATE_LIMITS } from '../../../../lib/security/rate-limiter';
import { createAuditLogger, AuditEventType } from '../../../../lib/security/audit-logger';
import { addToBlacklist, isTokenRevoked } from '../../../../lib/oauth/token-blacklist';

interface TokenRevocationRequest {
  token: string;
  token_type_hint?: 'access_token' | 'refresh_token';
}

async function revokeHandler(request: NextRequest): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    
    // Allow both authenticated users and clients to revoke tokens
    const contentType = request.headers.get('content-type');
    let body: TokenRevocationRequest;
    
    // Parse request body (support both JSON and form-encoded)
    if (contentType?.includes('application/json')) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = {
        token: formData.get('token')?.toString() || '',
        token_type_hint: formData.get('token_type_hint')?.toString() as any
      };
    }
    
    const { token, token_type_hint } = body;
    
    if (!token) {
      return NextResponse.json({
        error: 'invalid_request',
        error_description: 'Missing token parameter'
      }, { status: 400 });
    }
    
    const logger = createAuditLogger(request, session?.user);
    
    try {
      // Validate the token to get its claims
      const tokenClaims = await validateToken(token);
      
      // Check if user is authorized to revoke this token
      if (session?.user) {
        // User is revoking their own token - verify ownership
        if (tokenClaims.user_email && tokenClaims.user_email !== session.user.email) {
          logger.logSecurityEvent(
            AuditEventType.SECURITY_UNAUTHORIZED_ACCESS,
            'Attempted to revoke another user\'s token',
            'failure',
            {
              token_user_email: tokenClaims.user_email,
              requesting_user_email: session.user.email,
              token_preview: token.substring(0, 16) + '...'
            },
            'high'
          );
          
          return NextResponse.json({
            error: 'unauthorized',
            error_description: 'Cannot revoke token belonging to another user'
          }, { status: 403 });
        }
      }
      
      // Add token to blacklist
      await addToBlacklist(token);
      
      // Log successful revocation
      logger.logOAuthEvent(
        AuditEventType.OAUTH_TOKEN_REVOKED,
        `Token revoked successfully`,
        tokenClaims.client_id,
        'success',
        {
          token_type: tokenClaims.token_type,
          token_type_hint,
          token_preview: token.substring(0, 16) + '...',
          revoked_by: session?.user?.email || 'client',
          scopes: tokenClaims.scope,
          expires_at: new Date(tokenClaims.exp * 1000).toISOString()
        },
        'medium'
      );
      
      console.log(`✅ Token revoked successfully for client: ${tokenClaims.client_id}`);
      
      // Return 200 OK (RFC 7009 specifies this even for invalid tokens)
      return NextResponse.json({}, { status: 200 });
      
    } catch (tokenError) {
      // Token is invalid or expired - still return 200 OK per RFC 7009
      logger.log(
        AuditEventType.OAUTH_TOKEN_REVOKED,
        'Token revocation attempted (invalid/expired token)',
        'success',
        {
          token_preview: token.substring(0, 16) + '...',
          error: tokenError instanceof Error ? tokenError.message : 'Invalid token',
          revoked_by: session?.user?.email || 'client'
        },
        'low'
      );
      
      console.log(`⚠️ Token revocation attempted for invalid/expired token: ${token.substring(0, 8)}...`);
      
      // Still add to blacklist in case it's a malformed but dangerous token
      await addToBlacklist(token);
      
      return NextResponse.json({}, { status: 200 });
    }
    
  } catch (error) {
    console.error('❌ Token revocation error:', error);
    
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to process token revocation'
    }, { status: 500 });
  }
}

// Token revocation checking is now handled by lib/oauth/token-blacklist.ts

/**
 * Get revocation status endpoint (for debugging/admin)
 */
async function getRevocationStatus(request: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    return NextResponse.json({
      error: 'unauthorized',
      error_description: 'Authentication required'
    }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  
  if (!token) {
    return NextResponse.json({
      error: 'invalid_request',
      error_description: 'Missing token parameter'
    }, { status: 400 });
  }
  
  const revoked = await isTokenRevoked(token);
  
  return NextResponse.json({
    token_preview: token.substring(0, 16) + '...',
    revoked,
    checked_at: new Date().toISOString()
  });
}

// Export rate-limited handlers
export const POST = withRateLimit(RATE_LIMITS.OAUTH_CONSENT, revokeHandler);
export const GET = withRateLimit(RATE_LIMITS.GENERAL, getRevocationStatus);