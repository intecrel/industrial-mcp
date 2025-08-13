/**
 * Dual Authentication Middleware
 * Supports both OAuth 2.1 (Bearer tokens) and existing MAC address authentication
 */

import { NextRequest } from 'next/server';
import { validateAccessToken, TokenClaims } from './jwt';
import { isToolAccessible } from './scopes';
import { isOAuthEnabled } from './config';

export interface AuthContext {
  method: 'oauth' | 'mac_address';
  userId: string;
  clientId?: string;
  scopes?: string[];
  permissions: string[];
}

export interface MacAddressAuthResult {
  userId: string;
  apiKey: string;
  macAddress: string;
  permissions: string[]; // All tools for MAC address auth
}

/**
 * Detect authentication method from request headers
 */
export const detectAuthMethod = (request: NextRequest): 'oauth' | 'mac_address' | 'none' => {
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');
  const macAddress = request.headers.get('x-mac-address');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return 'oauth';
  }
  
  if (apiKey && macAddress) {
    return 'mac_address';
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
 * Authenticate request using existing MAC address + API key method
 * This delegates to the existing validation logic
 */
export const authenticateMacAddress = async (request: NextRequest): Promise<AuthContext> => {
  try {
    const apiKey = request.headers.get('x-api-key');
    const macAddress = request.headers.get('x-mac-address');
    
    if (!apiKey || !macAddress) {
      throw new Error('Missing x-api-key or x-mac-address header');
    }
    
    // For now, we'll implement a simple validation that matches the existing pattern
    // In a real scenario, we'd integrate with the existing validation logic
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    // Basic API key validation (this would normally use the existing validateApiKey function)
    const primaryKey = process.env.API_KEY;
    if (!primaryKey || apiKey !== primaryKey) {
      throw new Error('Invalid API key');
    }
    
    // Basic MAC address validation 
    const authorizedMac = process.env.MAC_ADDRESS;
    if (!authorizedMac || macAddress !== authorizedMac) {
      throw new Error('Invalid MAC address');
    }
    
    console.log(`✅ MAC address authentication successful for ${macAddress} from ${clientIP}`);
    
    return {
      method: 'mac_address',
      userId: 'primary', // This would normally come from the API key config
      permissions: ['*'] // MAC address auth has access to all tools
    };
  } catch (error) {
    throw new Error(`MAC address authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Main authentication function - handles dual authentication
 */
export const authenticateRequest = async (request: NextRequest): Promise<AuthContext> => {
  const authMethod = detectAuthMethod(request);
  
  switch (authMethod) {
    case 'oauth':
      if (!isOAuthEnabled()) {
        throw new Error('OAuth authentication is disabled');
      }
      return await authenticateOAuth(request);
      
    case 'mac_address':
      return await authenticateMacAddress(request);
      
    case 'none':
      throw new Error('Authentication required. Provide either Bearer token or x-api-key + x-mac-address headers');
      
    default:
      throw new Error('Invalid authentication method');
  }
};

/**
 * Check if user has permission to access a specific tool
 */
export const hasToolPermission = (authContext: AuthContext, toolName: string): boolean => {
  // MAC address authentication has access to all tools
  if (authContext.method === 'mac_address') {
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
    return `MAC address user: ${authContext.userId}`;
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
  authMethods.push('API key + MAC address');
  
  return {
    error: isUnauthorized ? 'authentication_required' : 'authorization_failed',
    message,
    supported_auth_methods: authMethods,
    oauth_enabled: isOAuthEnabled()
  };
};