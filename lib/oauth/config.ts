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
  // Always use the custom production domain for OAuth to ensure consistency
  // Claude.ai needs stable URLs that don't change with deployments
  const baseUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://industrial-mcp-delta.vercel.app'; // Always use custom domain in production

  return {
    issuer: baseUrl,
    authorizationEndpoint: `${baseUrl}/api/oauth/authorize`,
    tokenEndpoint: `${baseUrl}/api/oauth/token`,
    jwksEndpoint: `${baseUrl}/api/oauth/jwks`,
    registrationEndpoint: `${baseUrl}/api/oauth/register`,
    supportedScopes: ['mcp:tools', 'mcp:resources', 'mcp:prompts', 'claudeai'],
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