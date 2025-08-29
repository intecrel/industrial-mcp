/**
 * Redis Key Management with Environment Prefixes
 * Provides environment-based key separation for single Redis database
 * Supports local development, preview deployments, and production
 */

/**
 * Determine environment prefix based on deployment context
 * - local: Local development (NODE_ENV !== production, no VERCEL_ENV)  
 * - preview: Vercel preview deployments (VERCEL_ENV = preview)
 * - prod: Production deployment (VERCEL_ENV = production or NODE_ENV = production)
 */
export const getEnvironmentPrefix = (): string => {
  // Vercel environment detection (most reliable)
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production') {
    return 'prod:';
  }
  if (vercelEnv === 'preview') {
    return 'preview:';
  }
  
  // Fallback to NODE_ENV for non-Vercel deployments
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    return 'prod:';
  }
  
  // Default to local development
  return 'local:';
};

/**
 * Generate environment-prefixed Redis key
 */
export const getRedisKey = (key: string): string => {
  const prefix = getEnvironmentPrefix();
  return `${prefix}${key}`;
};

/**
 * Redis key generators for OAuth storage
 */
export const RedisKeys = {
  client: (clientId: string) => getRedisKey(`oauth:client:${clientId}`),
  authCode: (code: string) => getRedisKey(`oauth:code:${code}`),
  rateLimit: (clientId: string, window: string) => getRedisKey(`oauth:rate:${clientId}:${window}`),
  clientPattern: () => getRedisKey('oauth:client:*'),
} as const;

/**
 * Environment information for logging and debugging
 */
export const getEnvironmentInfo = () => {
  const prefix = getEnvironmentPrefix();
  const environment = prefix.replace(':', '');
  
  return {
    environment,
    prefix,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    redisEnabled: process.env.ENABLE_REDIS_STORAGE === 'true',
  };
};