/**
 * Dual Authentication Middleware
 * Supports both OAuth 2.1 (Bearer tokens) and existing MAC address authentication
 */

import { NextRequest } from 'next/server';
import { validateAccessToken, TokenClaims } from './jwt';
import { isToolAccessible } from './scopes';
import { isOAuthEnabled } from './config';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import { validateDeviceFromCookie, getDeviceInfo, verifyMacAddressLegacy } from '@/lib/auth/device-verification';

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
 * Authenticate request using secure device verification
 * Uses device fingerprinting and secure cookie validation
 */
export const authenticateMacAddress = async (request: NextRequest): Promise<AuthContext> => {
  try {
    // Check if MAC verification module is enabled
    if (!isFeatureEnabled('MAC_VERIFICATION')) {
      // Fallback to legacy (insecure) MAC authentication when disabled
      return await authenticateMacAddressLegacy(request);
    }

    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey) {
      throw new Error('Missing x-api-key header');
    }
    
    // Validate API key
    const primaryKey = process.env.API_KEY;
    if (!primaryKey || apiKey !== primaryKey) {
      throw new Error('Invalid API key');
    }
    
    // Use secure device validation instead of trusting headers
    const isDeviceValid = validateDeviceFromCookie(request);
    
    if (!isDeviceValid) {
      throw new Error('Device not verified. Please verify your device at the homepage first.');
    }
    
    // Get device information for logging and context
    const deviceInfo = getDeviceInfo(request);
    const deviceId = request.cookies.get('mcp-device-id')?.value || deviceInfo.deviceId;
    
    console.log(`✅ Secure device authentication successful`, {
      deviceId,
      ip: deviceInfo.ip,
      platform: deviceInfo.platform
    });
    
    return {
      method: 'mac_address',
      userId: `device:${deviceId}`,
      permissions: ['*'] // Device auth has access to all tools
    };
  } catch (error) {
    throw new Error(`Device authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Legacy MAC authentication (INSECURE - trusts client headers)
 * Only used when MAC_VERIFICATION feature flag is disabled
 */
export const authenticateMacAddressLegacy = async (request: NextRequest): Promise<AuthContext> => {
  try {
    console.log('⚠️ Using LEGACY MAC authentication - trusts client headers (INSECURE)');
    
    const apiKey = request.headers.get('x-api-key');
    const macAddress = request.headers.get('x-mac-address');
    
    if (!apiKey || !macAddress) {
      throw new Error('Missing x-api-key or x-mac-address header');
    }
    
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    // Basic API key validation
    const primaryKey = process.env.API_KEY;
    if (!primaryKey || apiKey !== primaryKey) {
      throw new Error('Invalid API key');
    }
    
    // INSECURE: Trust client-provided MAC address header (use allowlist)
    const isValidMac = verifyMacAddressLegacy(macAddress);
    if (!isValidMac) {
      throw new Error('Invalid MAC address');
    }
    
    console.log(`⚠️ Legacy MAC address authentication for ${macAddress} from ${clientIP} (INSECURE)`);
    
    return {
      method: 'mac_address',
      userId: 'legacy-mac-user',
      permissions: ['*']
    };
  } catch (error) {
    throw new Error(`Legacy MAC address authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  
  // Show different MAC auth requirements based on feature flag
  if (isFeatureEnabled('MAC_VERIFICATION')) {
    authMethods.push('API key + verified MAC address (secure cookie required)');
  } else {
    authMethods.push('API key + MAC address header (legacy mode)');
  }
  
  return {
    error: isUnauthorized ? 'authentication_required' : 'authorization_failed',
    message,
    supported_auth_methods: authMethods,
    oauth_enabled: isOAuthEnabled(),
    mac_verification_enabled: isFeatureEnabled('MAC_VERIFICATION'),
    verification_url: isFeatureEnabled('MAC_VERIFICATION') ? '/api/verify' : null
  };
};