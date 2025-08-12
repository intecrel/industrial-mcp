/**
 * OAuth 2.1 Configuration for Industrial MCP Server
 * Supports dynamic Vercel URL configuration for flexible deployment
 */

export interface OAuthConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  registrationEndpoint: string;
  supportedScopes: string[];
  jwtSecret: string;
  jwtAlgorithm: string;
  accessTokenTtl: number;
  authCodeTtl: number;
}

/**
 * Get OAuth configuration with dynamic URL support for Vercel deployments
 */
export const getOAuthConfig = (): OAuthConfig => {
  // Dynamic base URL configuration for Vercel's random URLs
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://industrial-mcp-delta.vercel.app'; // production fallback

  return {
    issuer: baseUrl,
    authorizationEndpoint: `${baseUrl}/api/oauth/authorize`,
    tokenEndpoint: `${baseUrl}/api/oauth/token`,
    jwksEndpoint: `${baseUrl}/api/oauth/jwks`,
    registrationEndpoint: `${baseUrl}/api/oauth/register`,
    supportedScopes: ['read:analytics', 'read:knowledge', 'admin:usage'],
    jwtSecret: process.env.OAUTH_JWT_SECRET || 'dev-secret-change-in-production',
    jwtAlgorithm: 'HS256', // Using symmetric for simplicity, can upgrade to RS256 later
    accessTokenTtl: 3600, // 1 hour
    authCodeTtl: 600, // 10 minutes
  };
};

/**
 * Validate OAuth configuration on startup
 */
export const validateOAuthConfig = (config: OAuthConfig): void => {
  if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-change-in-production') {
    throw new Error('OAUTH_JWT_SECRET must be set in production');
  }
  
  if (!config.supportedScopes || config.supportedScopes.length === 0) {
    throw new Error('At least one OAuth scope must be configured');
  }
  
  console.log(`✅ OAuth configuration validated for issuer: ${config.issuer}`);
};

/**
 * Check if OAuth is enabled
 */
export const isOAuthEnabled = (): boolean => {
  return process.env.ENABLE_OAUTH !== 'false'; // Enabled by default
};