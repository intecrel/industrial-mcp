/**
 * CSRF Token Endpoint
 * Provides CSRF tokens for OAuth form protection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth/config';
import { generateCSRFToken, hashCSRFToken } from '../../../lib/security/csrf';
import { withRateLimit, RATE_LIMITS } from '../../../lib/security/rate-limiter';

async function csrfHandler(request: NextRequest): Promise<Response> {
  try {
    // Only provide CSRF tokens to authenticated users
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({
        error: 'unauthorized',
        error_description: 'Authentication required for CSRF token'
      }, { status: 401 });
    }

    const csrfData = generateCSRFToken();
    const tokenHash = hashCSRFToken(csrfData.token);
    
    console.log(`🛡️ CSRF token generated for user: ${session.user.email}`);
    
    return NextResponse.json({
      csrf_token: csrfData.token,
      _csrf_token_hash: tokenHash,
      _csrf_expires: csrfData.expires,
      expires_in: Math.floor((csrfData.expires - Date.now()) / 1000)
    });
    
  } catch (error) {
    console.error('❌ CSRF token generation error:', error);
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to generate CSRF token'
    }, { status: 500 });
  }
}

// Export rate-limited handler
export const GET = withRateLimit(RATE_LIMITS.CSRF_TOKEN, csrfHandler);