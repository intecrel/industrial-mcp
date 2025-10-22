/**
 * Next.js Instrumentation
 * This file is called once when the server starts
 * Perfect place to load environment variables from Redis
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadEnvFromRedis } = await import('./lib/config/redis-env-loader')

    try {
      console.log('🚀 Loading environment variables from Redis on startup...')
      await loadEnvFromRedis()
    } catch (error) {
      console.error('❌ Failed to load env vars from Redis during startup:', error)
    }
  }
}
