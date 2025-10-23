/**
 * Authentication Middleware
 * Supports OAuth 2.1 (Bearer tokens) and API key authentication
 */

import { NextRequest } from 'next/server';
import { validateAccessToken, TokenClaims } from './jwt';
import { isToolAccessible } from './scopes';
import { isOAuthEnabled } from './config';

export interface AuthContext {
  method: 'oauth' | 'api_key';
  userId: string;
  clientId?: string;
  scopes?: string[];
  permissions: string[];
}

/**
 * Detect authentication method from request headers
 */
export const detectAuthMethod = (request: NextRequest): 'oauth' | 'api_key' | 'none' => {
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return 'oauth';
  }

  if (apiKey) {
    return 'api_key';
  }

  return 'none';
};

/**
 * Authenticate request using OAuth Bearer token
 */
export const authenticateOAuth = async (request: NextRequest): Promise<AuthContext> => {
  try {
    const authHeader = request.headers.get('authorization');
    const claims: TokenClaims = await validateAccessToken(authHeader);
    
    const scopes = claims.scope.split(' ').filter(s => s.length > 0);
    
    return {
      method: 'oauth',
      userId: claims.client_id,
      clientId: claims.client_id,
      scopes,
      permissions: scopes // For OAuth, permissions are the scopes
    };
  } catch (error) {
    throw new Error(`OAuth authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Authenticate request using API key
 * Simple server-to-server authentication
 */
export const authenticateApiKey = async (request: NextRequest): Promise<AuthContext> => {
  try {
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      throw new Error('Missing x-api-key header');
    }

    // Load API key from Redis if not in process.env
    let primaryKey = process.env.API_KEY;
    if (!primaryKey) {
      // Try loading from Redis
      try {
        const { getEnv } = await import('../config/redis-env-loader');
        primaryKey = await getEnv('API_KEY');
      } catch (error) {
        console.warn('⚠️ Failed to load API_KEY from Redis:', error);
      }
    }

    if (!primaryKey || apiKey !== primaryKey) {
      throw new Error('Invalid API key');
    }

    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    console.log(`✅ API key authentication successful from ${clientIP}`);

    return {
      method: 'api_key',
      userId: 'api-key-user',
      permissions: ['*'] // API key has access to all tools
    };
  } catch (error) {
    throw new Error(`API key authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Main authentication function - handles OAuth and API key authentication
 */
export const authenticateRequest = async (request: NextRequest): Promise<AuthContext> => {
  const authMethod = detectAuthMethod(request);

  switch (authMethod) {
    case 'oauth':
      if (!isOAuthEnabled()) {
        throw new Error('OAuth authentication is disabled');
      }
      return await authenticateOAuth(request);

    case 'api_key':
      return await authenticateApiKey(request);

    case 'none':
      throw new Error('Authentication required. Provide either Bearer token or x-api-key header');

    default:
      throw new Error('Invalid authentication method');
  }
};

/**
 * Check if user has permission to access a specific tool
 */
export const hasToolPermission = (authContext: AuthContext, toolName: string): boolean => {
  // API key authentication has access to all tools
  if (authContext.method === 'api_key') {
    return authContext.permissions.includes('*');
  }

  // OAuth authentication uses scope-based access control
  if (authContext.method === 'oauth' && authContext.scopes) {
    return isToolAccessible(toolName, authContext.scopes);
  }

  return false;
};

/**
 * Get authentication info for logging/debugging
 */
export const getAuthInfo = (authContext: AuthContext): string => {
  if (authContext.method === 'oauth') {
    return `OAuth client: ${authContext.clientId} (scopes: ${authContext.scopes?.join(' ') || 'none'})`;
  } else {
    return `API key user: ${authContext.userId}`;
  }
};

/**
 * Create authentication error response
 */
export const createAuthError = (message: string, statusCode: number = 401) => {
  const isUnauthorized = statusCode === 401;
  const authMethods = [];

  if (isOAuthEnabled()) {
    authMethods.push('Bearer token (OAuth 2.1)');
  }

  authMethods.push('API key (x-api-key header)');

  return {
    error: isUnauthorized ? 'authentication_required' : 'authorization_failed',
    message,
    supported_auth_methods: authMethods,
    oauth_enabled: isOAuthEnabled()
  };
};