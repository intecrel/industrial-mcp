/**
 * JWT Token Management for OAuth 2.1 Implementation
 * Handles token generation, validation, and claims management
 */

import { SignJWT, jwtVerify } from 'jose';
import { getOAuthConfig } from './config';

export interface TokenClaims {
  iss: string; // Issuer
  sub: string; // Subject (client_id)
  aud: string; // Audience (API identifier)
  exp: number; // Expiration time
  iat: number; // Issued at
  scope: string; // OAuth scopes
  client_id: string; // OAuth client identifier
  token_type: 'access_token' | 'authorization_code';
  redirect_uri?: string; // For authorization codes
  code_challenge?: string; // For PKCE
  code_challenge_method?: string; // For PKCE
  [key: string]: any; // Index signature for JWT payload
}

export interface AccessTokenPayload {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  client_id: string;
}

/**
 * Generate JWT secret as Uint8Array for jose library
 */
const getJwtSecret = (): Uint8Array => {
  const config = getOAuthConfig();
  return new TextEncoder().encode(config.jwtSecret);
};

/**
 * Generate an access token for OAuth client
 */
export const generateAccessToken = async (
  clientId: string, 
  scopes: string[]
): Promise<AccessTokenPayload> => {
  const config = getOAuthConfig();
  const now = Math.floor(Date.now() / 1000);
  
  // Add 30-second buffer for clock skew and connection stability
  const clockSkewBuffer = 30;
  
  const claims: TokenClaims = {
    iss: config.issuer,
    sub: clientId,
    aud: config.issuer, // API identifier
    exp: now + config.accessTokenTtl,
    iat: now - clockSkewBuffer, // Issue token slightly in past for clock skew
    scope: scopes.join(' '),
    client_id: clientId,
    token_type: 'access_token'
  };

  const secret = getJwtSecret();
  
  const accessToken = await new SignJWT(claims)
    .setProtectedHeader({ alg: config.jwtAlgorithm })
    .sign(secret);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: config.accessTokenTtl,
    scope: scopes.join(' '),
    client_id: clientId
  };
};

/**
 * Generate an authorization code for OAuth flow
 */
export const generateAuthorizationCode = async (
  clientId: string,
  scopes: string[],
  redirectUri: string,
  codeChallenge?: string,
  codeChallengeMethod?: string
): Promise<string> => {
  const config = getOAuthConfig();
  const now = Math.floor(Date.now() / 1000);
  
  const claims = {
    iss: config.issuer,
    sub: clientId,
    aud: config.issuer,
    exp: now + config.authCodeTtl,
    iat: now,
    scope: scopes.join(' '),
    client_id: clientId,
    token_type: 'authorization_code' as const,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  };

  const secret = getJwtSecret();
  
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: config.jwtAlgorithm })
    .sign(secret);
};

/**
 * Validate and decode JWT token
 */
export const validateToken = async (token: string): Promise<TokenClaims> => {
  try {
    const config = getOAuthConfig();
    const secret = getJwtSecret();
    
    const { payload } = await jwtVerify(token, secret, {
      issuer: config.issuer,
      audience: config.issuer,
    });

    return payload as unknown as TokenClaims;
  } catch (error) {
    throw new Error(`Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Extract Bearer token from Authorization header
 */
export const extractBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authorizationHeader.substring(7); // Remove "Bearer " prefix
};

/**
 * Validate access token and return claims
 */
export const validateAccessToken = async (authorizationHeader: string | null): Promise<TokenClaims> => {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    throw new Error('Missing or invalid Authorization header');
  }
  
  const claims = await validateToken(token);
  
  if (claims.token_type !== 'access_token') {
    throw new Error('Invalid token type');
  }
  
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    throw new Error('Token expired');
  }
  
  return claims;
};

/**
 * Generate a secure random string for client secrets, codes, etc.
 */
export const generateSecureRandomString = (length: number = 32): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomArray[i] % chars.length];
  }
  
  return result;
};