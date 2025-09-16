/**
 * Admin OAuth Clients API
 * Provides super admin access to view all OAuth clients and their grants
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth/config';
import { withRateLimit, RATE_LIMITS } from '../../../../lib/security/rate-limiter';
import { getAllConsentGrants, getClientGrants } from '../../../../lib/oauth/consent-grants';
import { getAllClients } from '../../../../lib/oauth/clients';

/**
 * Get super admin email list from environment or fallback to hardcoded
 */
function getSuperAdminEmails(): string[] {
  const envEmails = process.env.SUPER_ADMIN_EMAILS;
  
  if (envEmails) {
    return envEmails.split(',').map(email => email.trim()).filter(email => email.length > 0);
  }
  
  // Fallback to hardcoded list (for development/demo)
  return [
    'admin@intecrel.com',
    'akbar@intecrel.com',
    // Add more super admin emails as needed
  ];
}

/**
 * Check if user is super admin
 */
function isSuperAdmin(userEmail?: string | null): boolean {
  if (!userEmail) return false;
  
  const superAdminEmails = getSuperAdminEmails();
  return superAdminEmails.includes(userEmail);
}

async function getOAuthClientsAdmin(request: NextRequest): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      }, { status: 401 });
    }

    // Check super admin access
    if (!isSuperAdmin(session.user.email)) {
      return NextResponse.json({
        error: 'forbidden',
        error_description: 'Super admin access required'
      }, { status: 403 });
    }

    // Get all registered clients
    const clients = await getAllClients();
    
    // Get all consent grants
    const allGrants = await getAllConsentGrants();
    
    // Group grants by client
    const clientsWithGrants = clients.map((client: any) => {
      const clientGrants = allGrants.filter(grant => grant.client_id === client.client_id);
      
      // Get unique users for this client
      const uniqueUsers = Array.from(new Set(clientGrants.map(grant => grant.user_email)))
        .map(email => {
          const userGrants = clientGrants.filter(grant => grant.user_email === email);
          const latestGrant = userGrants.sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime())[0];
          
          return {
            email: email,
            user_id: latestGrant?.user_id,
            grants_count: userGrants.length,
            active_grants: userGrants.filter(g => g.status === 'active').length,
            first_granted: userGrants.sort((a, b) => new Date(a.granted_at).getTime() - new Date(b.granted_at).getTime())[0]?.granted_at,
            last_used: userGrants.sort((a, b) => new Date(b.last_used).getTime() - new Date(a.last_used).getTime())[0]?.last_used,
            scopes: Array.from(new Set(userGrants.flatMap(g => g.scopes)))
          };
        });

      return {
        ...client,
        total_grants: clientGrants.length,
        active_grants: clientGrants.filter(g => g.status === 'active').length,
        unique_users: uniqueUsers.length,
        users: uniqueUsers.sort((a, b) => new Date(b.last_used).getTime() - new Date(a.last_used).getTime())
      };
    });

    // Add summary statistics
    const totalUsers = new Set(allGrants.map(g => g.user_email)).size;
    const totalActiveGrants = allGrants.filter(g => g.status === 'active').length;
    
    console.log(`📊 Admin OAuth clients view accessed by ${session.user.email}`);
    console.log(`📊 Total clients: ${clients.length}, Total users: ${totalUsers}, Active grants: ${totalActiveGrants}`);

    return NextResponse.json({
      clients: clientsWithGrants,
      summary: {
        total_clients: clients.length,
        total_users: totalUsers,
        total_grants: allGrants.length,
        active_grants: totalActiveGrants,
        revoked_grants: allGrants.filter(g => g.status === 'revoked').length
      },
      accessed_by: session.user.email,
      accessed_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching admin OAuth clients data:', error);
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to fetch OAuth clients data'
    }, { status: 500 });
  }
}

async function getClientDetails(request: NextRequest): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({
        error: 'unauthorized',
        error_description: 'Authentication required'
      }, { status: 401 });
    }

    // Check super admin access
    if (!isSuperAdmin(session.user.email)) {
      return NextResponse.json({
        error: 'forbidden',
        error_description: 'Super admin access required'
      }, { status: 403 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id');
    
    if (!clientId) {
      return NextResponse.json({
        error: 'invalid_request',
        error_description: 'Missing client_id parameter'
      }, { status: 400 });
    }

    // Get client grants
    const grants = await getClientGrants(clientId);
    
    // Get registered clients to find client info
    const clients = await getAllClients();
    const client = clients.find((c: any) => c.client_id === clientId);
    
    if (!client) {
      return NextResponse.json({
        error: 'not_found',
        error_description: 'Client not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      client: client,
      grants: grants.sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime()),
      total_grants: grants.length,
      active_grants: grants.filter(g => g.status === 'active').length,
      unique_users: new Set(grants.map(g => g.user_email)).size
    });
    
  } catch (error) {
    console.error('❌ Error fetching client details:', error);
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to fetch client details'
    }, { status: 500 });
  }
}

// Export rate-limited handlers
export const GET = withRateLimit(RATE_LIMITS.GENERAL, async (request: NextRequest) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  
  if (clientId) {
    return getClientDetails(request);
  } else {
    return getOAuthClientsAdmin(request);
  }
});