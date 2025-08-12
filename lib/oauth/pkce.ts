/**
 * PKCE (Proof Key for Code Exchange) Implementation
 * RFC 7636 implementation for OAuth 2.1 security
 */

import { createHash } from 'crypto';

/**
 * Generate a cryptographically secure code verifier
 * Base64URL-encoded string of 32-96 characters
 */
export const generateCodeVerifier = (): string => {
  const buffer = new Uint8Array(32); // 32 bytes = 256 bits
  crypto.getRandomValues(buffer);
  
  // Convert to base64url encoding
  return btoa(String.fromCharCode.apply(null, Array.from(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Generate code challenge from code verifier
 * SHA256 hash of the code verifier, base64url-encoded
 */
export const generateCodeChallenge = (codeVerifier: string): string => {
  const hash = createHash('sha256');
  hash.update(codeVerifier);
  const digest = hash.digest();
  
  // Convert to base64url encoding
  return Buffer.from(digest)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Verify PKCE code challenge against code verifier
 */
export const verifyPkceChallenge = (
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string = 'S256'
): boolean => {
  if (codeChallengeMethod !== 'S256' && codeChallengeMethod !== 'plain') {
    return false;
  }
  
  if (codeChallengeMethod === 'plain') {
    return codeVerifier === codeChallenge;
  }
  
  // S256 method
  const expectedChallenge = generateCodeChallenge(codeVerifier);
  return expectedChallenge === codeChallenge;
};

/**
 * Validate code verifier format (43-128 characters, base64url)
 */
export const isValidCodeVerifier = (codeVerifier: string): boolean => {
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return (
    codeVerifier.length >= 43 &&
    codeVerifier.length <= 128 &&
    base64urlPattern.test(codeVerifier)
  );
};

/**
 * Validate code challenge format
 */
export const isValidCodeChallenge = (codeChallenge: string): boolean => {
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return (
    codeChallenge.length >= 43 &&
    codeChallenge.length <= 128 &&
    base64urlPattern.test(codeChallenge)
  );
};

/**
 * Generate PKCE pair for client-side use (development/testing)
 */
export const generatePkcePair = (): { codeVerifier: string; codeChallenge: string } => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge
  };
};