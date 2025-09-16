/**
 * OAuth Storage Abstraction Layer
 * Provides persistent storage for OAuth clients and authorization codes
 * Supports both Redis (production/preview) and in-memory (development/fallback)
 */

import { Redis } from '@upstash/redis';
import { OAuthClient } from './clients';
import { RedisKeys, getEnvironmentInfo } from './redis-keys';

export interface AuthCodeData {
  client_id: string;
  scope: string;
  redirect_uri: string;
  code_challenge?: string;
  code_challenge_method?: string;
  created_at: number;
}

export interface StorageAdapter {
  // Client management
  setClient(clientId: string, client: OAuthClient): Promise<void>;
  getClient(clientId: string): Promise<OAuthClient | null>;
  getAllClients(): Promise<OAuthClient[]>;
  deleteClient(clientId: string): Promise<void>;
  
  // Authorization code management
  setAuthCode(code: string, data: AuthCodeData, ttlSeconds: number): Promise<void>;
  getAuthCode(code: string): Promise<AuthCodeData | null>;
  deleteAuthCode(code: string): Promise<void>;
  
  // Rate limiting (optional)
  incrementRateLimit(clientId: string, window: string): Promise<number>;
  getRateLimit(clientId: string, window: string): Promise<number>;
  
  // Health check
  ping(): Promise<boolean>;
  
  // Cleanup
  cleanup(): Promise<void>;
}

/**
 * Redis-based storage adapter using Upstash
 */
class RedisStorageAdapter implements StorageAdapter {
  private redis: Redis;
  
  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      throw new Error('Redis configuration missing: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN required');
    }
    
    this.redis = new Redis({
      url,
      token
    });
    
    const envInfo = getEnvironmentInfo();
    console.log(`✅ Redis storage adapter initialized (${envInfo.environment})`, envInfo);
  }
  
  async setClient(clientId: string, client: OAuthClient): Promise<void> {
    try {
      await this.redis.set(RedisKeys.client(clientId), JSON.stringify(client));
      console.log(`📦 Client stored in Redis: ${clientId}`);
    } catch (error) {
      console.error(`❌ Redis setClient error:`, error);
      throw new Error(`Failed to store client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async getClient(clientId: string): Promise<OAuthClient | null> {
    try {
      const data = await this.redis.get(RedisKeys.client(clientId));
      if (!data) {
        return null;
      }
      
      // Handle both string and object responses from Upstash Redis
      let client: OAuthClient;
      if (typeof data === 'string') {
        client = JSON.parse(data) as OAuthClient;
      } else if (typeof data === 'object') {
        client = data as OAuthClient;
      } else {
        console.error(`❌ Unexpected Redis data type: ${typeof data}`);
        return null;
      }
      
      console.log(`📦 Client retrieved from Redis: ${clientId}`);
      return client;
    } catch (error) {
      console.error(`❌ Redis getClient error:`, error);
      return null; // Graceful degradation
    }
  }
  
  async getAllClients(): Promise<OAuthClient[]> {
    try {
      const keys = await this.redis.keys(RedisKeys.clientPattern());
      if (keys.length === 0) {
        return [];
      }
      
      const clients: OAuthClient[] = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          // Handle both string and object responses from Upstash Redis
          if (typeof data === 'string') {
            clients.push(JSON.parse(data) as OAuthClient);
          } else if (typeof data === 'object') {
            clients.push(data as OAuthClient);
          }
        }
      }
      
      console.log(`📦 Retrieved ${clients.length} clients from Redis`);
      return clients;
    } catch (error) {
      console.error(`❌ Redis getAllClients error:`, error);
      return []; // Graceful degradation
    }
  }
  
  async deleteClient(clientId: string): Promise<void> {
    try {
      await this.redis.del(RedisKeys.client(clientId));
      console.log(`🗑️ Client deleted from Redis: ${clientId}`);
    } catch (error) {
      console.error(`❌ Redis deleteClient error:`, error);
      throw new Error(`Failed to delete client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async setAuthCode(code: string, data: AuthCodeData, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.setex(RedisKeys.authCode(code), ttlSeconds, JSON.stringify(data));
      console.log(`🔐 Auth code stored in Redis with TTL ${ttlSeconds}s`);
    } catch (error) {
      console.error(`❌ Redis setAuthCode error:`, error);
      throw new Error(`Failed to store auth code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    try {
      const data = await this.redis.get(RedisKeys.authCode(code));
      if (!data) {
        return null;
      }
      
      // Handle both string and object responses from Upstash Redis
      let authData: AuthCodeData;
      if (typeof data === 'string') {
        authData = JSON.parse(data) as AuthCodeData;
      } else if (typeof data === 'object') {
        authData = data as AuthCodeData;
      } else {
        console.error(`❌ Unexpected Redis auth code data type: ${typeof data}`);
        return null;
      }
      
      console.log(`🔐 Auth code retrieved from Redis`);
      return authData;
    } catch (error) {
      console.error(`❌ Redis getAuthCode error:`, error);
      return null; // Graceful degradation
    }
  }
  
  async deleteAuthCode(code: string): Promise<void> {
    try {
      await this.redis.del(RedisKeys.authCode(code));
      console.log(`🗑️ Auth code deleted from Redis`);
    } catch (error) {
      console.error(`❌ Redis deleteAuthCode error:`, error);
      // Don't throw - auth codes are temporary anyway
    }
  }
  
  async incrementRateLimit(clientId: string, window: string): Promise<number> {
    try {
      const key = RedisKeys.rateLimit(clientId, window);
      const count = await this.redis.incr(key);
      
      // Set TTL on first increment
      if (count === 1) {
        await this.redis.expire(key, 3600); // 1 hour TTL
      }
      
      return count;
    } catch (error) {
      console.error(`❌ Redis incrementRateLimit error:`, error);
      return 1; // Fail open for rate limiting
    }
  }
  
  async getRateLimit(clientId: string, window: string): Promise<number> {
    try {
      const count = await this.redis.get(RedisKeys.rateLimit(clientId, window));
      return count ? parseInt(count as string, 10) : 0;
    } catch (error) {
      console.error(`❌ Redis getRateLimit error:`, error);
      return 0; // Fail open for rate limiting
    }
  }
  
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error(`❌ Redis ping error:`, error);
      return false;
    }
  }
  
  async cleanup(): Promise<void> {
    // Redis handles TTL cleanup automatically
    console.log('🧹 Redis cleanup: TTL-based, no manual cleanup needed');
  }
}

/**
 * In-memory storage adapter for development and fallback
 */
class InMemoryStorageAdapter implements StorageAdapter {
  private clients = new Map<string, OAuthClient>();
  private authCodes = new Map<string, { data: AuthCodeData; expires: number }>();
  private rateLimits = new Map<string, { count: number; expires: number }>();
  
  constructor() {
    console.log('✅ In-memory storage adapter initialized');
    
    // Cleanup expired items every 5 minutes
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }
  
  async setClient(clientId: string, client: OAuthClient): Promise<void> {
    this.clients.set(clientId, client);
    console.log(`📦 Client stored in memory: ${clientId}`);
  }
  
  async getClient(clientId: string): Promise<OAuthClient | null> {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`📦 Client retrieved from memory: ${clientId}`);
    }
    return client || null;
  }
  
  async getAllClients(): Promise<OAuthClient[]> {
    const clients = Array.from(this.clients.values());
    console.log(`📦 Retrieved ${clients.length} clients from memory`);
    return clients;
  }
  
  async deleteClient(clientId: string): Promise<void> {
    this.clients.delete(clientId);
    console.log(`🗑️ Client deleted from memory: ${clientId}`);
  }
  
  async setAuthCode(code: string, data: AuthCodeData, ttlSeconds: number): Promise<void> {
    const expires = Date.now() + (ttlSeconds * 1000);
    this.authCodes.set(code, { data, expires });
    console.log(`🔐 Auth code stored in memory with TTL ${ttlSeconds}s`);
  }
  
  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    const entry = this.authCodes.get(code);
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expires) {
      this.authCodes.delete(code);
      return null;
    }
    
    console.log(`🔐 Auth code retrieved from memory`);
    return entry.data;
  }
  
  async deleteAuthCode(code: string): Promise<void> {
    this.authCodes.delete(code);
    console.log(`🗑️ Auth code deleted from memory`);
  }
  
  async incrementRateLimit(clientId: string, window: string): Promise<number> {
    const key = `${clientId}:${window}`;
    const now = Date.now();
    const hourStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const expires = hourStart + (60 * 60 * 1000);
    
    const entry = this.rateLimits.get(key);
    if (!entry || now > entry.expires) {
      this.rateLimits.set(key, { count: 1, expires });
      return 1;
    }
    
    entry.count++;
    return entry.count;
  }
  
  async getRateLimit(clientId: string, window: string): Promise<number> {
    const key = `${clientId}:${window}`;
    const entry = this.rateLimits.get(key);
    
    if (!entry || Date.now() > entry.expires) {
      return 0;
    }
    
    return entry.count;
  }
  
  async ping(): Promise<boolean> {
    return true; // Always healthy
  }
  
  async cleanup(): Promise<void> {
    const now = Date.now();
    
    // Clean expired auth codes
    Array.from(this.authCodes.entries()).forEach(([code, entry]) => {
      if (now > entry.expires) {
        this.authCodes.delete(code);
      }
    });
    
    // Clean expired rate limits
    Array.from(this.rateLimits.entries()).forEach(([key, entry]) => {
      if (now > entry.expires) {
        this.rateLimits.delete(key);
      }
    });
    
    console.log('🧹 In-memory cleanup completed');
  }
}

/**
 * Storage factory - creates appropriate adapter based on environment
 */
export const createStorageAdapter = (): StorageAdapter => {
  const useRedis = process.env.ENABLE_REDIS_STORAGE === 'true' && 
                  process.env.UPSTASH_REDIS_REST_URL && 
                  process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (useRedis) {
    try {
      return new RedisStorageAdapter();
    } catch (error) {
      console.error('❌ Failed to initialize Redis storage, falling back to in-memory:', error);
      return new InMemoryStorageAdapter();
    }
  } else {
    console.log('📝 Using in-memory storage (development mode)');
    return new InMemoryStorageAdapter();
  }
};

// Singleton storage instance
let storageInstance: StorageAdapter | null = null;

/**
 * Get the global storage adapter instance
 */
export const getStorageAdapter = (): StorageAdapter => {
  if (!storageInstance) {
    storageInstance = createStorageAdapter();
  }
  return storageInstance;
};

/**
 * Reset storage adapter (for testing)
 */
export const resetStorageAdapter = (): void => {
  storageInstance = null;
};

/**
 * Get Redis client for direct usage (Auth0 integration)
 */
export const getRedisClient = (): Redis => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    throw new Error('Redis configuration missing: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN required');
  }
  
  return new Redis({
    url,
    token
  });
};