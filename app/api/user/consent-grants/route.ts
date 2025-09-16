/**
 * User Consent Grants API
 * Allows users to view their OAuth consent grants
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth/config';
import { withRateLimit, RATE_LIMITS } from '../../../../lib/security/rate-limiter';
import { 
  getUserConsentGrants, 
  type ConsentGrant 
} from '../../../../lib/oauth/consent-grants';

async function getConsentGrants(request: NextRequest): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      }, { status: 401 });
    }

    // Get grants for the current user
    const userGrants = await getUserConsentGrants(session.user.email!);

    console.log(`📋 Returning ${userGrants.length} consent grants for user: ${session.user.email}`);

    return NextResponse.json({
      grants: userGrants,
      total_count: userGrants.length,
      active_count: userGrants.filter(g => g.status === 'active').length
    });
    
  } catch (error) {
    console.error('❌ Error fetching consent grants:', error);
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to fetch consent grants'
    }, { status: 500 });
  }
}

// Export rate-limited handler
export const GET = withRateLimit(RATE_LIMITS.GENERAL, getConsentGrants);