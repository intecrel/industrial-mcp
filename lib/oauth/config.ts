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
  let baseUrl: string;
  
  if (process.env.NODE_ENV === 'development') {
    baseUrl = 'http://localhost:3000';
  } else {
    // Use Vercel environment detection for proper URL handling
    const vercelUrl = process.env.VERCEL_URL;
    const vercelEnv = process.env.VERCEL_ENV;
    const productionUrl = 'https://industrial-mcp-delta.vercel.app';
    
    if (vercelEnv === 'preview' && vercelUrl) {
      // For preview deployments, use the dynamic Vercel URL
      baseUrl = `https://${vercelUrl}`;
      console.log(`🔄 Preview deployment using: ${baseUrl}`);
    } else if (vercelEnv === 'production') {
      // For production, use the custom domain
      baseUrl = productionUrl;
      console.log(`🚀 Production deployment using: ${baseUrl}`);
    } else if (vercelUrl) {
      // Fallback for other Vercel deployments
      baseUrl = `https://${vercelUrl}`;
      console.log(`🌐 Vercel deployment using: ${baseUrl}`);
    } else {
      // Final fallback
      baseUrl = productionUrl;
      console.log(`⚠️ Fallback to production URL: ${baseUrl}`);
    }
  }

  return {
    issuer: baseUrl,
    authorizationEndpoint: `${baseUrl}/api/oauth/authorize`,
    tokenEndpoint: `${baseUrl}/api/oauth/token`,
    jwksEndpoint: `${baseUrl}/api/oauth/jwks`,
    registrationEndpoint: `${baseUrl}/api/oauth/register`,
    supportedScopes: ['mcp:tools', 'mcp:resources', 'mcp:prompts', 'claudeai'],
    jwtSecret: process.env.OAUTH_JWT_SECRET || 'dev-secret-change-in-production',
    jwtAlgorithm: 'HS256', // Using symmetric for simplicity, can upgrade to RS256 later
    accessTokenTtl: 86400, // 24 hours (extended for MCP client stability)
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

/**
 * Check if Redis storage is enabled
 */
export const isRedisEnabled = (): boolean => {
  return process.env.ENABLE_REDIS_STORAGE === 'true' && 
         !!process.env.UPSTASH_REDIS_REST_URL && 
         !!process.env.UPSTASH_REDIS_REST_TOKEN;
};

/**
 * Get environment type
 */
export const getEnvironmentType = (): 'development' | 'preview' | 'production' => {
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  // Vercel preview deployments
  if (process.env.VERCEL_ENV === 'preview') {
    return 'preview';
  }
  
  // Production deployment
  return 'production';
};

/**
 * Get current deployment URL (for redirects and internal links)
 * This should match the OAuth issuer URL for consistency
 */
export const getCurrentDeploymentUrl = (): string => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  
  // Use same logic as OAuth config for consistency
  const vercelUrl = process.env.VERCEL_URL;
  const vercelEnv = process.env.VERCEL_ENV;
  const productionUrl = 'https://industrial-mcp-delta.vercel.app';
  
  if (vercelEnv === 'preview' && vercelUrl) {
    return `https://${vercelUrl}`;
  } else if (vercelEnv === 'production') {
    return productionUrl;
  } else if (vercelUrl) {
    return `https://${vercelUrl}`;
  }
  
  return productionUrl;
};