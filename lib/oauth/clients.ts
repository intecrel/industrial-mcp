/**
 * OAuth Client Management
 * Handles client registration, validation, and metadata storage
 */

import { generateSecureRandomString } from './jwt';

export interface OAuthClient {
  client_id: string;
  client_secret?: string; // For confidential clients
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic';
  application_type: 'web' | 'native';
  created_at: number;
  updated_at: number;
}

export interface ClientRegistrationRequest {
  client_name: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  token_endpoint_auth_method?: 'none' | 'client_secret_post' | 'client_secret_basic';
  application_type?: 'web' | 'native';
}

export interface ClientRegistrationResponse extends OAuthClient {
  client_id_issued_at: number;
  client_secret_expires_at?: number;
}

// In-memory client storage (in production, use a database)
const registeredClients = new Map<string, OAuthClient>();

/**
 * Default clients for well-known integrations
 */
const initializeDefaultClients = () => {
  // Claude Desktop client
  const claudeDesktopClient: OAuthClient = {
    client_id: 'claude-desktop',
    client_name: 'Claude Desktop',
    redirect_uris: ['http://localhost', 'https://localhost'], // Claude Desktop supports localhost
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'read:analytics read:knowledge admin:usage',
    token_endpoint_auth_method: 'none', // Public client
    application_type: 'native',
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  
  // Claude.ai web client
  const claudeWebClient: OAuthClient = {
    client_id: 'claude-web',
    client_name: 'Claude.ai Web',
    redirect_uris: ['https://claude.ai/oauth/callback'], // Hypothetical Claude.ai OAuth callback
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'read:analytics read:knowledge',
    token_endpoint_auth_method: 'none', // Public client for simplicity
    application_type: 'web',
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  
  registeredClients.set(claudeDesktopClient.client_id, claudeDesktopClient);
  registeredClients.set(claudeWebClient.client_id, claudeWebClient);
  
  console.log('✅ Default OAuth clients initialized:', Array.from(registeredClients.keys()));
};

// Initialize default clients
initializeDefaultClients();

/**
 * Register a new OAuth client
 */
export const registerClient = (request: ClientRegistrationRequest): ClientRegistrationResponse => {
  const clientId = generateSecureRandomString(16);
  const now = Date.now();
  
  // Set defaults
  const client: OAuthClient = {
    client_id: clientId,
    client_name: request.client_name,
    redirect_uris: request.redirect_uris || [],
    grant_types: request.grant_types || ['authorization_code'],
    response_types: request.response_types || ['code'],
    scope: request.scope || 'read:analytics read:knowledge',
    token_endpoint_auth_method: request.token_endpoint_auth_method || 'none',
    application_type: request.application_type || 'web',
    created_at: now,
    updated_at: now,
  };
  
  // Generate client secret for confidential clients
  if (client.token_endpoint_auth_method !== 'none') {
    client.client_secret = generateSecureRandomString(32);
  }
  
  // Validate redirect URIs
  if (client.redirect_uris.length === 0) {
    throw new Error('At least one redirect URI is required');
  }
  
  for (const uri of client.redirect_uris) {
    if (!isValidRedirectUri(uri)) {
      throw new Error(`Invalid redirect URI: ${uri}`);
    }
  }
  
  registeredClients.set(clientId, client);
  
  const response: ClientRegistrationResponse = {
    ...client,
    client_id_issued_at: Math.floor(now / 1000),
  };
  
  if (client.client_secret) {
    response.client_secret_expires_at = 0; // Never expires for now
  }
  
  console.log(`✅ OAuth client registered: ${client.client_name} (${clientId})`);
  return response;
};

/**
 * Get client by ID
 */
export const getClient = (clientId: string): OAuthClient | undefined => {
  return registeredClients.get(clientId);
};

/**
 * Validate client exists and has valid configuration
 */
export const validateClient = (clientId: string): OAuthClient => {
  const client = getClient(clientId);
  if (!client) {
    throw new Error(`Invalid client_id: ${clientId}`);
  }
  return client;
};

/**
 * Validate redirect URI against registered URIs
 */
export const validateRedirectUri = (clientId: string, redirectUri: string): boolean => {
  const client = getClient(clientId);
  if (!client) {
    return false;
  }
  
  return client.redirect_uris.includes(redirectUri);
};

/**
 * Check if redirect URI format is valid
 */
const isValidRedirectUri = (uri: string): boolean => {
  try {
    const url = new URL(uri);
    
    // Must be HTTPS or localhost for development
    if (url.protocol === 'https:') {
      return true;
    }
    
    if (url.protocol === 'http:' && (
      url.hostname === 'localhost' || 
      url.hostname === '127.0.0.1' ||
      url.hostname.startsWith('192.168.') ||
      url.hostname.startsWith('10.') ||
      url.hostname.startsWith('172.')
    )) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
};

/**
 * Get all registered clients (admin endpoint)
 */
export const getAllClients = (): OAuthClient[] => {
  return Array.from(registeredClients.values());
};

/**
 * Authenticate client credentials
 */
export const authenticateClient = (
  clientId: string, 
  clientSecret?: string
): OAuthClient => {
  const client = validateClient(clientId);
  
  if (client.token_endpoint_auth_method === 'none') {
    // Public client - no secret required
    return client;
  }
  
  if (!clientSecret || client.client_secret !== clientSecret) {
    throw new Error('Invalid client credentials');
  }
  
  return client;
};