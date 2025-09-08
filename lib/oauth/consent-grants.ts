/**
 * OAuth Consent Grants Management with Redis/Upstash
 * Handles user consent grant storage and retrieval
 */

import { Redis } from '@upstash/redis';

export interface ConsentGrant {
  id: string;
  user_email: string;
  user_id?: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  granted_at: string;
  last_used: string;
  status: 'active' | 'revoked';
}

// Redis client for consent grants
let redis: Redis | null = null;
const useRedis = process.env.ENABLE_REDIS_STORAGE === 'true' && 
                 process.env.UPSTASH_REDIS_REST_URL && 
                 process.env.UPSTASH_REDIS_REST_TOKEN;

// In-memory fallback for development
const memoryGrants = new Map<string, ConsentGrant>();

// Environment-based key prefix
const getKeyPrefix = (): string => {
  if (process.env.VERCEL_ENV === 'production') return 'prod:';
  if (process.env.VERCEL_ENV === 'preview') return 'preview:';
  return 'local:';
};

/**
 * Initialize Redis client if enabled
 */
function getRedisClient(): Redis | null {
  if (!useRedis) return null;
  
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  
  return redis;
}

/**
 * Generate unique grant ID
 */
function generateGrantId(): string {
  return `grant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add a consent grant
 */
export async function addConsentGrant(
  userEmail: string,
  clientId: string,
  clientName: string,
  scopes: string[],
  userId?: string
): Promise<string> {
  const grantId = generateGrantId();
  const now = new Date().toISOString();
  
  const grant: ConsentGrant = {
    id: grantId,
    user_email: userEmail,
    user_id: userId,
    client_id: clientId,
    client_name: clientName,
    scopes,
    granted_at: now,
    last_used: now,
    status: 'active'
  };

  const client = getRedisClient();
  
  if (client) {
    try {
      const grantKey = `${getKeyPrefix()}oauth:grants:${grantId}`;
      const userGrantsKey = `${getKeyPrefix()}oauth:user_grants:${userEmail}`;
      const clientGrantsKey = `${getKeyPrefix()}oauth:client_grants:${clientId}`;
      
      // Store grant details (Redis expects Record<string, string>)
      await client.hset(grantKey, {
        ...grant,
        scopes: JSON.stringify(grant.scopes)
      });
      
      // Add to user's grants list
      await client.sadd(userGrantsKey, grantId);
      
      // Add to client's grants list (for admin view)
      await client.sadd(clientGrantsKey, grantId);
      
      // Set expiration for cleanup (1 year)
      await client.expire(grantKey, 31536000);
      await client.expire(userGrantsKey, 31536000);
      await client.expire(clientGrantsKey, 31536000);
      
    } catch (error) {
      console.warn('Redis consent grant add failed, using memory fallback:', error);
      memoryGrants.set(grantId, grant);
    }
  } else {
    memoryGrants.set(grantId, grant);
  }
  
  return grantId;
}

/**
 * Get consent grants for a user
 */
export async function getUserConsentGrants(userEmail: string): Promise<ConsentGrant[]> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const userGrantsKey = `${getKeyPrefix()}oauth:user_grants:${userEmail}`;
      const grantIds = await client.smembers(userGrantsKey);
      
      if (grantIds.length === 0) return [];
      
      const grants: ConsentGrant[] = [];
      for (const grantId of grantIds) {
        const grantKey = `${getKeyPrefix()}oauth:grants:${grantId}`;
        const grantData = await client.hgetall(grantKey);
        
        if (grantData && Object.keys(grantData).length > 0) {
          grants.push({
            id: grantData.id as string,
            user_email: grantData.user_email as string,
            user_id: grantData.user_id as string,
            client_id: grantData.client_id as string,
            client_name: grantData.client_name as string,
            granted_at: grantData.granted_at as string,
            last_used: grantData.last_used as string,
            status: grantData.status as 'active' | 'revoked',
            scopes: typeof grantData.scopes === 'string' ? JSON.parse(grantData.scopes) : grantData.scopes
          });
        }
      }
      
      return grants;
    } catch (error) {
      console.warn('Redis consent grant fetch failed, using memory fallback:', error);
      return Array.from(memoryGrants.values()).filter(grant => grant.user_email === userEmail);
    }
  } else {
    return Array.from(memoryGrants.values()).filter(grant => grant.user_email === userEmail);
  }
}

/**
 * Get all consent grants for admin view
 */
export async function getAllConsentGrants(): Promise<ConsentGrant[]> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const pattern = `${getKeyPrefix()}oauth:grants:*`;
      const keys = await client.keys(pattern);
      
      const grants: ConsentGrant[] = [];
      for (const key of keys) {
        const grantData = await client.hgetall(key);
        
        if (grantData && Object.keys(grantData).length > 0) {
          grants.push({
            id: grantData.id as string,
            user_email: grantData.user_email as string,
            user_id: grantData.user_id as string,
            client_id: grantData.client_id as string,
            client_name: grantData.client_name as string,
            granted_at: grantData.granted_at as string,
            last_used: grantData.last_used as string,
            status: grantData.status as 'active' | 'revoked',
            scopes: typeof grantData.scopes === 'string' ? JSON.parse(grantData.scopes) : grantData.scopes
          });
        }
      }
      
      return grants.sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime());
    } catch (error) {
      console.warn('Redis all grants fetch failed, using memory fallback:', error);
      return Array.from(memoryGrants.values()).sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime());
    }
  } else {
    return Array.from(memoryGrants.values()).sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime());
  }
}

/**
 * Update last used timestamp for a grant
 */
export async function updateLastUsed(userEmail: string, clientId: string): Promise<void> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const userGrantsKey = `${getKeyPrefix()}oauth:user_grants:${userEmail}`;
      const grantIds = await client.smembers(userGrantsKey);
      
      for (const grantId of grantIds) {
        const grantKey = `${getKeyPrefix()}oauth:grants:${grantId}`;
        const grantData = await client.hgetall(grantKey);
        
        if (grantData && grantData.client_id === clientId && grantData.status === 'active') {
          await client.hset(grantKey, { last_used: new Date().toISOString() });
          break;
        }
      }
    } catch (error) {
      console.warn('Redis last used update failed, using memory fallback:', error);
      const grant = Array.from(memoryGrants.values()).find(g => 
        g.user_email === userEmail && 
        g.client_id === clientId && 
        g.status === 'active'
      );
      
      if (grant) {
        grant.last_used = new Date().toISOString();
      }
    }
  } else {
    const grant = Array.from(memoryGrants.values()).find(g => 
      g.user_email === userEmail && 
      g.client_id === clientId && 
      g.status === 'active'
    );
    
    if (grant) {
      grant.last_used = new Date().toISOString();
    }
  }
}

/**
 * Revoke a consent grant
 */
export async function revokeGrant(grantId: string, userEmail: string): Promise<boolean> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const grantKey = `${getKeyPrefix()}oauth:grants:${grantId}`;
      const grantData = await client.hgetall(grantKey);
      
      if (grantData && grantData.user_email === userEmail) {
        await client.hset(grantKey, { status: 'revoked' });
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn('Redis grant revoke failed, using memory fallback:', error);
      const grant = memoryGrants.get(grantId);
      
      if (grant && grant.user_email === userEmail) {
        grant.status = 'revoked';
        return true;
      }
      
      return false;
    }
  } else {
    const grant = memoryGrants.get(grantId);
    
    if (grant && grant.user_email === userEmail) {
      grant.status = 'revoked';
      return true;
    }
    
    return false;
  }
}

/**
 * Get grants by client ID (for admin view)
 */
export async function getClientGrants(clientId: string): Promise<ConsentGrant[]> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const clientGrantsKey = `${getKeyPrefix()}oauth:client_grants:${clientId}`;
      const grantIds = await client.smembers(clientGrantsKey);
      
      const grants: ConsentGrant[] = [];
      for (const grantId of grantIds) {
        const grantKey = `${getKeyPrefix()}oauth:grants:${grantId}`;
        const grantData = await client.hgetall(grantKey);
        
        if (grantData && Object.keys(grantData).length > 0) {
          grants.push({
            id: grantData.id as string,
            user_email: grantData.user_email as string,
            user_id: grantData.user_id as string,
            client_id: grantData.client_id as string,
            client_name: grantData.client_name as string,
            granted_at: grantData.granted_at as string,
            last_used: grantData.last_used as string,
            status: grantData.status as 'active' | 'revoked',
            scopes: typeof grantData.scopes === 'string' ? JSON.parse(grantData.scopes) : grantData.scopes
          });
        }
      }
      
      return grants;
    } catch (error) {
      console.warn('Redis client grants fetch failed, using memory fallback:', error);
      return Array.from(memoryGrants.values()).filter(grant => grant.client_id === clientId);
    }
  } else {
    return Array.from(memoryGrants.values()).filter(grant => grant.client_id === clientId);
  }
}