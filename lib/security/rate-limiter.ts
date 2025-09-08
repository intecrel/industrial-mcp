/**
 * Rate Limiting for OAuth and Authentication Endpoints
 * Prevents abuse and DoS attacks on sensitive endpoints
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked?: boolean;
  blockUntil?: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
  skipSuccessful?: boolean;
}

// In-memory store (use Redis/external store for production scaling)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations for different endpoints
export const RATE_LIMITS = {
  // OAuth consent - more restrictive
  OAUTH_CONSENT: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
    skipSuccessful: true
  } as RateLimitConfig,

  // OAuth authorization - moderate
  OAUTH_AUTHORIZE: {
    maxRequests: 10,
    windowMs: 10 * 60 * 1000, // 10 minutes
    blockDurationMs: 15 * 60 * 1000 // 15 minutes block
  } as RateLimitConfig,

  // Auth signin - more permissive but still protected
  AUTH_SIGNIN: {
    maxRequests: 20,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 5 * 60 * 1000 // 5 minutes block
  } as RateLimitConfig,

  // CSRF token - moderate
  CSRF_TOKEN: {
    maxRequests: 30,
    windowMs: 15 * 60 * 1000, // 15 minutes
    skipSuccessful: true
  } as RateLimitConfig,

  // General API - permissive
  GENERAL: {
    maxRequests: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
  } as RateLimitConfig,
};

/**
 * Get client identifier for rate limiting
 */
function getClientId(request: Request): string {
  // Try to get client IP from various headers (Vercel/proxy headers)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  const ip = forwardedFor?.split(',')[0] || realIp || cfConnectingIp || 'unknown';
  
  // Combine with user agent for better uniqueness
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const userAgentHash = Buffer.from(userAgent).toString('base64').substring(0, 10);
  
  return `${ip}:${userAgentHash}`;
}

/**
 * Check and update rate limit for a request
 */
export function checkRateLimit(
  request: Request, 
  config: RateLimitConfig,
  identifier?: string
): { allowed: boolean; remaining: number; resetTime: number; error?: string } {
  const clientId = identifier || getClientId(request);
  const now = Date.now();
  const key = `${clientId}`;
  
  // Clean up expired entries periodically
  if (Math.random() < 0.01) { // 1% chance to cleanup
    for (const [k, entry] of Array.from(rateLimitStore.entries())) {
      if (now > entry.resetTime && (!entry.blockUntil || now > entry.blockUntil)) {
        rateLimitStore.delete(k);
      }
    }
  }
  
  let entry = rateLimitStore.get(key);
  
  // Check if client is currently blocked
  if (entry?.blocked && entry.blockUntil && now < entry.blockUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockUntil,
      error: `Rate limit exceeded. Blocked until ${new Date(entry.blockUntil).toISOString()}`
    };
  }
  
  // Initialize or reset window
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
      blocked: false
    };
    rateLimitStore.set(key, entry);
  }
  
  // Increment counter
  entry.count++;
  
  const remaining = Math.max(0, config.maxRequests - entry.count);
  
  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    // Apply block if configured
    if (config.blockDurationMs) {
      entry.blocked = true;
      entry.blockUntil = now + config.blockDurationMs;
      console.warn(`🚨 Rate limit exceeded for ${clientId}, blocked until ${new Date(entry.blockUntil).toISOString()}`);
    }
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      error: 'Rate limit exceeded'
    };
  }
  
  return {
    allowed: true,
    remaining,
    resetTime: entry.resetTime
  };
}

/**
 * Middleware wrapper for rate limiting
 */
export function withRateLimit<T extends any[]>(
  config: RateLimitConfig,
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    const [request] = args;
    
    const rateLimit = checkRateLimit(request, config);
    
    if (!rateLimit.allowed) {
      console.warn(`🚨 Rate limit exceeded for request to ${new URL(request.url).pathname}`);
      
      return new Response(
        JSON.stringify({
          error: 'rate_limit_exceeded',
          error_description: rateLimit.error || 'Too many requests',
          retry_after: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
        }),
        { 
          status: 429,
          headers: { 
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
            'X-RateLimit-Reset': rateLimit.resetTime.toString(),
            'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString()
          }
        }
      );
    }
    
    const response = await handler(...args);
    
    // Add rate limit headers to successful responses
    response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimit.resetTime.toString());
    
    return response;
  };
}

/**
 * Mark a successful request (for skipSuccessful config)
 */
export function markSuccessfulRequest(request: Request, identifier?: string) {
  const clientId = identifier || getClientId(request);
  const key = `${clientId}`;
  const entry = rateLimitStore.get(key);
  
  if (entry && entry.count > 0) {
    entry.count = Math.max(0, entry.count - 1); // Reduce count for successful requests
  }
}