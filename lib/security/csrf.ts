/**
 * CSRF Protection for OAuth Forms
 * Prevents Cross-Site Request Forgery attacks on consent and OAuth endpoints
 */

import { randomBytes, createHash } from 'crypto';

export interface CSRFToken {
  token: string;
  expires: number;
}

/**
 * Generate a secure CSRF token
 */
export function generateCSRFToken(): CSRFToken {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + (30 * 60 * 1000); // 30 minutes
  
  return { token, expires };
}

/**
 * Create CSRF token hash for validation
 */
export function hashCSRFToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(
  providedToken: string,
  storedTokenHash: string,
  expires: number
): { valid: boolean; error?: string } {
  // Check expiration
  if (Date.now() > expires) {
    return { valid: false, error: 'CSRF token expired' };
  }
  
  // Hash provided token and compare
  const providedHash = hashCSRFToken(providedToken);
  
  if (providedHash !== storedTokenHash) {
    return { valid: false, error: 'Invalid CSRF token' };
  }
  
  return { valid: true };
}

/**
 * CSRF middleware for API routes
 */
export function withCSRFProtection<T extends any[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    const [request] = args;
    
    // Skip CSRF for GET requests
    if (request.method === 'GET') {
      return handler(...args);
    }
    
    const csrfToken = request.headers.get('x-csrf-token');
    const body = await request.clone().json().catch(() => ({}));
    const storedToken = body._csrf_token;
    const expires = body._csrf_expires;
    
    if (!csrfToken || !storedToken || !expires) {
      return new Response(
        JSON.stringify({
          error: 'csrf_required',
          error_description: 'CSRF token required'
        }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const validation = validateCSRFToken(csrfToken, storedToken, expires);
    
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          error: 'csrf_invalid',
          error_description: validation.error
        }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    return handler(...args);
  };
}