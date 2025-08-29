/**
 * OAuth Client Management
 * Handles client registration, validation, and metadata storage
 * Now uses persistent storage instead of in-memory maps
 */

import { generateSecureRandomString } from './jwt';
import { getStorageAdapter } from './storage';

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

// Storage adapter for persistent client storage
// Automatically uses Redis in production/preview, in-memory for development

/**
 * Default clients for well-known integrations
 * These are automatically stored in persistent storage on first access
 */
const getDefaultClients = (): OAuthClient[] => {
  const now = Date.now();
  
  return [
    // Claude Desktop client
    {
      client_id: 'claude-desktop',
      client_name: 'Claude Desktop',
      redirect_uris: ['http://localhost', 'https://localhost'], // Claude Desktop supports localhost
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'mcp:tools mcp:resources mcp:prompts',
      token_endpoint_auth_method: 'none', // Public client
      application_type: 'native',
      created_at: now,
      updated_at: now,
    },
    // Claude.ai web client (matches dynamic registration pattern)
    {
      client_id: 'claude-web',
      client_name: 'Claude',
      redirect_uris: [
        'https://claude.ai/api/mcp/auth_callback', // Official Claude.ai MCP OAuth callback
        'https://claude.ai/oauth/callback',
        'https://claude.ai/api/organizations/*/mcp/callback', 
        'https://claude.ai/settings/connectors',
        'https://claude.ai/'
      ], 
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'mcp:tools mcp:resources mcp:prompts claudeai read:analytics read:knowledge admin:usage',
      token_endpoint_auth_method: 'none', // No client secret required for fallback client
      application_type: 'web',
      created_at: now,
      updated_at: now,
    }
  ];
};

/**
 * Initialize default clients in storage if they don't exist
 */
const initializeDefaultClients = async (): Promise<void> => {
  try {
    const storage = getStorageAdapter();
    const defaultClients = getDefaultClients();
    
    for (const client of defaultClients) {
      const existing = await storage.getClient(client.client_id);
      if (!existing) {
        await storage.setClient(client.client_id, client);
        console.log(`✅ Default client initialized: ${client.client_name} (${client.client_id})`);
      }
    }
    
    console.log('✅ Default OAuth clients verification completed');
  } catch (error) {
    console.error('❌ Failed to initialize default clients:', error);
    // Don't throw - fallback to runtime initialization
  }
};

// Initialize default clients asynchronously
initializeDefaultClients();

/**
 * Register a new OAuth client
 */
export const registerClient = async (request: ClientRegistrationRequest): Promise<ClientRegistrationResponse> => {
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
  
  // Store in persistent storage
  const storage = getStorageAdapter();
  await storage.setClient(clientId, client);
  
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
export const getClient = async (clientId: string): Promise<OAuthClient | undefined> => {
  const storage = getStorageAdapter();
  const client = await storage.getClient(clientId);
  
  // If not found and it's a default client, initialize it
  if (!client) {
    const defaultClients = getDefaultClients();
    const defaultClient = defaultClients.find(c => c.client_id === clientId);
    if (defaultClient) {
      await storage.setClient(clientId, defaultClient);
      console.log(`✅ Default client initialized on demand: ${defaultClient.client_name}`);
      return defaultClient;
    }
  }
  
  return client || undefined;
};

/**
 * Validate client exists and has valid configuration
 */
export const validateClient = async (clientId: string): Promise<OAuthClient> => {
  const client = await getClient(clientId);
  if (!client) {
    throw new Error(`Invalid client_id: ${clientId}`);
  }
  return client;
};

/**
 * Validate redirect URI against registered URIs
 */
export const validateRedirectUri = async (clientId: string, redirectUri: string): Promise<boolean> => {
  const client = await getClient(clientId);
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
export const getAllClients = async (): Promise<OAuthClient[]> => {
  const storage = getStorageAdapter();
  return await storage.getAllClients();
};

/**
 * Authenticate client credentials
 */
export const authenticateClient = async (
  clientId: string, 
  clientSecret?: string
): Promise<OAuthClient> => {
  const client = await validateClient(clientId);
  
  if (client.token_endpoint_auth_method === 'none') {
    // Public client - no secret required
    return client;
  }
  
  if (!clientSecret || client.client_secret !== clientSecret) {
    throw new Error('Invalid client credentials');
  }
  
  return client;
};