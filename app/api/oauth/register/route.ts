/**
 * OAuth 2.1 Dynamic Client Registration Endpoint
 * RFC 7591 - OAuth 2.0 Dynamic Client Registration Protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  registerClient, 
  ClientRegistrationRequest,
  ClientRegistrationResponse 
} from '../../../../lib/oauth/clients';
import { validateScopes } from '../../../../lib/oauth/scopes';

export async function POST(request: NextRequest) {
  try {
    // Parse JSON request body
    let registrationRequest: ClientRegistrationRequest;
    try {
      registrationRequest = await request.json();
      console.log('📋 Client registration request:', JSON.stringify(registrationRequest, null, 2));
    } catch (error) {
      console.error('❌ Invalid JSON in registration request:', error);
      return createErrorResponse('invalid_request', 'Invalid JSON in request body');
    }
    
    // Validate required fields
    if (!registrationRequest.client_name) {
      return createErrorResponse('invalid_client_metadata', 'client_name is required');
    }
    
    // Validate client_name format
    if (registrationRequest.client_name.length < 1 || registrationRequest.client_name.length > 255) {
      return createErrorResponse('invalid_client_metadata', 'client_name must be between 1 and 255 characters');
    }
    
    // Validate redirect_uris if provided
    if (registrationRequest.redirect_uris) {
      if (!Array.isArray(registrationRequest.redirect_uris) || registrationRequest.redirect_uris.length === 0) {
        return createErrorResponse('invalid_client_metadata', 'redirect_uris must be a non-empty array');
      }
      
      // Validate each redirect URI format
      for (const uri of registrationRequest.redirect_uris) {
        if (!isValidUri(uri)) {
          return createErrorResponse('invalid_redirect_uri', `Invalid redirect URI: ${uri}`);
        }
      }
    }
    
    // Validate grant_types if provided
    if (registrationRequest.grant_types) {
      const validGrantTypes = ['authorization_code'];
      for (const grantType of registrationRequest.grant_types) {
        if (!validGrantTypes.includes(grantType)) {
          return createErrorResponse('invalid_client_metadata', `Unsupported grant_type: ${grantType}`);
        }
      }
    }
    
    // Validate response_types if provided
    if (registrationRequest.response_types) {
      const validResponseTypes = ['code'];
      for (const responseType of registrationRequest.response_types) {
        if (!validResponseTypes.includes(responseType)) {
          return createErrorResponse('invalid_client_metadata', `Unsupported response_type: ${responseType}`);
        }
      }
    }
    
    // Validate scope if provided
    if (registrationRequest.scope) {
      const scopeValidation = validateScopes(registrationRequest.scope);
      if (!scopeValidation.valid) {
        return createErrorResponse('invalid_client_metadata', `Invalid scope: ${scopeValidation.errors.join(', ')}`);
      }
    }
    
    // Validate token_endpoint_auth_method if provided
    if (registrationRequest.token_endpoint_auth_method) {
      const validAuthMethods = ['none', 'client_secret_post', 'client_secret_basic'];
      if (!validAuthMethods.includes(registrationRequest.token_endpoint_auth_method)) {
        return createErrorResponse('invalid_client_metadata', `Unsupported token_endpoint_auth_method: ${registrationRequest.token_endpoint_auth_method}`);
      }
    }
    
    // Validate application_type if provided
    if (registrationRequest.application_type) {
      const validAppTypes = ['web', 'native'];
      if (!validAppTypes.includes(registrationRequest.application_type)) {
        return createErrorResponse('invalid_client_metadata', `Unsupported application_type: ${registrationRequest.application_type}`);
      }
    }
    
    try {
      // Register the client
      const clientResponse: ClientRegistrationResponse = registerClient(registrationRequest);
      
      console.log(`✅ OAuth client registered via API: ${clientResponse.client_name} (${clientResponse.client_id})`);
      
      return NextResponse.json(clientResponse, {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
      
    } catch (error) {
      console.error('❌ Error registering OAuth client:', error);
      return createErrorResponse('server_error', error instanceof Error ? error.message : 'Failed to register client');
    }
    
  } catch (error) {
    console.error('❌ Client registration endpoint error:', error);
    return createErrorResponse('server_error', 'Internal server error');
  }
}

/**
 * Validate URI format
 */
function isValidUri(uri: string): boolean {
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
}

/**
 * Create JSON error response according to RFC 7591
 */
function createErrorResponse(error: string, description: string): NextResponse {
  return NextResponse.json({
    error,
    error_description: description
  }, { 
    status: 400,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}