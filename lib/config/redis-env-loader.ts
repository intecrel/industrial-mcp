/**
 * Redis Environment Variable Loader
 * Loads environment variables from Upstash Redis at runtime
 * Used to bypass Vercel's 64KB environment variable limit
 */

let envCache: Record<string, string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 300000; // 5 minutes

/**
 * Determine the Redis key prefix based on environment
 */
function getEnvPrefix(): string {
  // Check VERCEL_ENV first (set by Vercel)
  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv === 'production') {
    return 'prod:env:';
  } else if (vercelEnv === 'preview') {
    return 'preview:env:';
  } else if (process.env.NODE_ENV === 'production') {
    // Fallback to prod if NODE_ENV is production but VERCEL_ENV not set
    return 'prod:env:';
  }

  // Local development
  return 'local:env:';
}

/**
 * Load all environment variables from Redis
 */
export async function loadEnvFromRedis(): Promise<Record<string, string>> {
  // Return cached values if still fresh
  if (envCache && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return envCache;
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    console.warn('⚠️ Redis credentials not available, using local env vars only');
    return {};
  }

  const envPrefix = getEnvPrefix();
  console.log(`🔍 Loading environment variables with prefix: ${envPrefix}`);

  try {
    // Get all keys with environment-specific prefix
    const keysResponse = await fetch(`${redisUrl}/keys/${envPrefix}*`, {
      headers: {
        'Authorization': `Bearer ${redisToken}`
      }
    });

    if (!keysResponse.ok) {
      throw new Error(`Failed to fetch keys: ${keysResponse.statusText}`);
    }

    const keysData = await keysResponse.json();
    const keys: string[] = keysData.result || [];

    console.log(`📦 Loading ${keys.length} environment variables from Redis...`);

    // Fetch all values in parallel
    const values = await Promise.all(
      keys.map(async (key) => {
        const response = await fetch(`${redisUrl}/get/${key}`, {
          headers: {
            'Authorization': `Bearer ${redisToken}`
          }
        });

        if (!response.ok) {
          console.warn(`⚠️ Failed to fetch ${key}`);
          return null;
        }

        const data = await response.json();
        const envKey = key.replace(envPrefix, '');

        // Redis stores values as JSON strings, so we need to parse them
        // e.g., "value" -> value (remove surrounding quotes)
        let value = data.result;
        if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        return { key: envKey, value };
      })
    );

    // Build environment object
    const env: Record<string, string> = {};
    values.forEach((item) => {
      if (item && item.value) {
        env[item.key] = item.value;
        // Also set in process.env for compatibility
        process.env[item.key] = item.value;
      }
    });

    envCache = env;
    cacheTimestamp = Date.now();

    console.log(`✅ Loaded ${Object.keys(env).length} environment variables from Redis`);
    return env;
  } catch (error) {
    console.error('❌ Failed to load env vars from Redis:', error);
    return {};
  }
}

/**
 * Get a specific environment variable (checks Redis cache first, then process.env)
 */
export async function getEnv(key: string): Promise<string | undefined> {
  // Check process.env first
  if (process.env[key]) {
    return process.env[key];
  }

  // Load from Redis if not in cache
  const env = await loadEnvFromRedis();
  return env[key] || process.env[key];
}

/**
 * Initialize environment variables from Redis on startup
 */
export async function initializeEnv(): Promise<void> {
  console.log('🔧 Initializing environment variables from Redis...');
  await loadEnvFromRedis();
}
