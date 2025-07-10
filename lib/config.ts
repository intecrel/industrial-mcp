/**
 * Global configuration for the Industrial-MCP application.
 * All values come from environment variables with sensible
 * fallbacks for local development.
 */

type AuthConfig = {
  MAC_ADDRESS: string
  ALLOWED_IPS: string[]
  BASE_URL: string
  API_KEY: string
  CLAUDE_ENDPOINT: string
  ACCESS_TOKEN?: string
}

/**
 * Small helper to read environment variables with fallbacks.
 * When `required=true`, an error will be thrown in production
 * if the variable is missing.
 */
function getEnv(
  key: string,
  fallback: string | undefined,
  required = false
): string {
  const value = process.env[key] ?? fallback

  if (required && process.env.NODE_ENV === 'production' && !value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  // At this stage value is `string | undefined`, but the check
  // above guarantees non-undefined in production when required.
  return (value ?? '') as string
}

export const AUTH_CONFIG: AuthConfig = {
  // Allow MAC address to be specified via env, fallback for dev.
  MAC_ADDRESS: getEnv('MAC_ADDRESS', '84:94:37:e4:24:88', true),

  // Comma-separated list of IPs allowed to access protected routes.
  ALLOWED_IPS: (process.env.ALLOWED_IPS ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),

  // Vercel automatically injects `VERCEL_URL` for deployed envs.
  BASE_URL: process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000',

  // API key is mandatory in production, optional in dev.
  API_KEY: getEnv('API_KEY', 'development-key', true),

  // Endpoint constants
  CLAUDE_ENDPOINT: '/api/claude/connect',

  // Optional token used to connect to external services (e.g., Claude)
  ACCESS_TOKEN: process.env.ACCESS_TOKEN
}