/**
 * Token Blacklist Management with Redis/Upstash
 * Handles revoked token checking for JWT validation
 */

import { Redis } from '@upstash/redis';

// Redis client for token blacklist
let redis: Redis | null = null;
const useRedis = process.env.ENABLE_REDIS_STORAGE === 'true' && 
                 process.env.UPSTASH_REDIS_REST_URL && 
                 process.env.UPSTASH_REDIS_REST_TOKEN;

// In-memory fallback for development
const memoryBlacklist = new Set<string>();

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
 * Add token to blacklist
 */
export async function addToBlacklist(token: string): Promise<void> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const key = `${getKeyPrefix()}oauth:blacklist:${token}`;
      // Set with 24 hour expiration (longer than max token lifetime)
      await client.setex(key, 86400, 'revoked');
    } catch (error) {
      console.warn('Redis blacklist add failed, using memory fallback:', error);
      memoryBlacklist.add(token);
    }
  } else {
    memoryBlacklist.add(token);
  }
}

/**
 * Check if token is in blacklist
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const key = `${getKeyPrefix()}oauth:blacklist:${token}`;
      const result = await client.get(key);
      return result === 'revoked';
    } catch (error) {
      console.warn('Redis blacklist check failed, using memory fallback:', error);
      return memoryBlacklist.has(token);
    }
  } else {
    return memoryBlacklist.has(token);
  }
}

/**
 * Remove token from blacklist (for cleanup)
 */
export async function removeFromBlacklist(token: string): Promise<void> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const key = `${getKeyPrefix()}oauth:blacklist:${token}`;
      await client.del(key);
    } catch (error) {
      console.warn('Redis blacklist remove failed, using memory fallback:', error);
      memoryBlacklist.delete(token);
    }
  } else {
    memoryBlacklist.delete(token);
  }
}

/**
 * Get blacklist size (for monitoring)
 */
export async function getBlacklistSize(): Promise<number> {
  const client = getRedisClient();
  
  if (client) {
    try {
      const pattern = `${getKeyPrefix()}oauth:blacklist:*`;
      const keys = await client.keys(pattern);
      return keys.length;
    } catch (error) {
      console.warn('Redis blacklist size check failed, using memory fallback:', error);
      return memoryBlacklist.size;
    }
  } else {
    return memoryBlacklist.size;
  }
}

/**
 * Clear blacklist (for testing/maintenance)
 */
export async function clearBlacklist(): Promise<void> {
  const client = getRedisClient();

  if (client) {
    try {
      const pattern = `${getKeyPrefix()}oauth:blacklist:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (error) {
      console.warn('Redis blacklist clear failed, using memory fallback:', error);
      memoryBlacklist.clear();
    }
  } else {
    memoryBlacklist.clear();
  }
}

/**
 * Revoke a refresh token by its JWT ID (for rotation)
 * MCP 2025-06-18 spec requires refresh token rotation for public clients
 */
export async function revokeRefreshToken(jti: string): Promise<void> {
  const client = getRedisClient();

  if (client) {
    try {
      const key = `${getKeyPrefix()}oauth:revoked-refresh:${jti}`;
      // Set with 30 day expiration (matches refresh token lifetime)
      await client.setex(key, 2592000, 'revoked');
    } catch (error) {
      console.warn('Redis refresh token revocation failed, using memory fallback:', error);
      memoryBlacklist.add(`refresh:${jti}`);
    }
  } else {
    memoryBlacklist.add(`refresh:${jti}`);
  }
}

/**
 * Check if refresh token is revoked by its JWT ID
 */
export async function isRefreshTokenRevoked(jti: string): Promise<boolean> {
  const client = getRedisClient();

  if (client) {
    try {
      const key = `${getKeyPrefix()}oauth:revoked-refresh:${jti}`;
      const result = await client.get(key);
      return result === 'revoked';
    } catch (error) {
      console.warn('Redis refresh token check failed, using memory fallback:', error);
      return memoryBlacklist.has(`refresh:${jti}`);
    }
  } else {
    return memoryBlacklist.has(`refresh:${jti}`);
  }
}