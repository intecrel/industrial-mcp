/**
 * Redis Environment Variable Loader
 * Loads environment variables from Upstash Redis at runtime
 * Used to bypass Vercel's 64KB environment variable limit
 */

let envCache: Record<string, string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 300000; // 5 minutes

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

  try {
    // Get all keys with prefix prod:env:
    const keysResponse = await fetch(`${redisUrl}/keys/prod:env:*`, {
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
        const envKey = key.replace('prod:env:', '');
        return { key: envKey, value: data.result };
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
