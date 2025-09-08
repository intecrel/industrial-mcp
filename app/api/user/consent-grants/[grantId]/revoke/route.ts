/**
 * Individual Consent Grant Revocation API
 * Allows users to revoke specific OAuth consent grants
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth/config';
import { withRateLimit, RATE_LIMITS } from '../../../../../../lib/security/rate-limiter';
import { createAuditLogger, AuditEventType } from '../../../../../../lib/security/audit-logger';
import { revokeGrant } from '../../../../../../lib/oauth/consent-grants-api';

interface RouteParams {
  params: { grantId: string };
}

async function revokeConsentGrant(
  request: NextRequest, 
  { params }: RouteParams
): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      }, { status: 401 });
    }

    const { grantId } = params;
    
    if (!grantId) {
      return NextResponse.json({
        error: 'invalid_request',
        error_description: 'Grant ID is required'
      }, { status: 400 });
    }

    // Revoke the grant
    const success = await revokeGrant(grantId, session.user.email);
    
    if (!success) {
      return NextResponse.json({
        error: 'not_found',
        error_description: 'Consent grant not found or not owned by user'
      }, { status: 404 });
    }

    // Log the revocation
    const logger = createAuditLogger(request, session.user);
    logger.logOAuthEvent(
      AuditEventType.OAUTH_TOKEN_REVOKED,
      `User revoked consent grant ${grantId}`,
      'user-revoked', // placeholder client_id
      'success',
      {
        grant_id: grantId,
        revoked_by: session.user.email,
        revocation_method: 'user_ui'
      },
      'medium'
    );

    console.log(`✅ Consent grant revoked by user: ${grantId} for ${session.user.email}`);

    return NextResponse.json({
      message: 'Consent grant revoked successfully',
      grant_id: grantId,
      revoked_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error revoking consent grant:', error);
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to revoke consent grant'
    }, { status: 500 });
  }
}

// Export rate-limited handler
export const POST = withRateLimit(RATE_LIMITS.OAUTH_CONSENT, revokeConsentGrant);