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

  // Phase 4: Database Write Operation Rate Limits

  // Neo4j write operations - very restrictive
  NEO4J_WRITE_CREATE: {
    maxRequests: 20,
    windowMs: 10 * 60 * 1000, // 10 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
    skipSuccessful: false // Always count write operations
  } as RateLimitConfig,

  NEO4J_WRITE_MERGE: {
    maxRequests: 15,
    windowMs: 10 * 60 * 1000, // 10 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
    skipSuccessful: false
  } as RateLimitConfig,

  NEO4J_WRITE_SET: {
    maxRequests: 10,
    windowMs: 10 * 60 * 1000, // 10 minutes
    blockDurationMs: 45 * 60 * 1000, // 45 minutes block (most restrictive)
    skipSuccessful: false
  } as RateLimitConfig,

  // Neo4j read operations - more permissive
  NEO4J_READ: {
    maxRequests: 200,
    windowMs: 10 * 60 * 1000, // 10 minutes
    blockDurationMs: 5 * 60 * 1000, // 5 minutes block
    skipSuccessful: true
  } as RateLimitConfig,

  // Batch operations - most restrictive
  NEO4J_BATCH_WRITE: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
    skipSuccessful: false
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

// Phase 4: Circuit Breaker Pattern and Enhanced Monitoring

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  openUntil?: number;
}

interface WriteOperationMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageExecutionTime: number;
  lastOperationTime: number;
  operationTypes: Record<string, number>;
}

// Circuit breaker store
const circuitBreakerStore = new Map<string, CircuitBreakerState>();

// Write operation metrics store
const writeMetricsStore = new Map<string, WriteOperationMetrics>();

// Circuit breaker configuration
export const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // Open circuit after 5 failures
  successThreshold: 3,        // Close circuit after 3 successes in half-open
  timeout: 60000,            // Keep circuit open for 1 minute
  monitoringWindow: 5 * 60 * 1000, // 5 minute monitoring window
};

/**
 * Circuit breaker for database write operations
 */
export class DatabaseCircuitBreaker {
  private identifier: string;

  constructor(identifier: string = 'default') {
    this.identifier = identifier;
  }

  private getState(): CircuitBreakerState {
    let state = circuitBreakerStore.get(this.identifier);
    if (!state) {
      state = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0
      };
      circuitBreakerStore.set(this.identifier, state);
    }
    return state;
  }

  /**
   * Check if operation is allowed
   */
  canExecute(): { allowed: boolean; reason?: string } {
    const state = this.getState();
    const now = Date.now();

    switch (state.state) {
      case 'CLOSED':
        return { allowed: true };

      case 'OPEN':
        if (state.openUntil && now < state.openUntil) {
          return {
            allowed: false,
            reason: `Circuit breaker is OPEN until ${new Date(state.openUntil).toISOString()}`
          };
        }
        // Transition to half-open
        state.state = 'HALF_OPEN';
        state.successCount = 0;
        return { allowed: true };

      case 'HALF_OPEN':
        return { allowed: true };

      default:
        return { allowed: false, reason: 'Unknown circuit breaker state' };
    }
  }

  /**
   * Record successful operation
   */
  recordSuccess(): void {
    const state = this.getState();
    state.lastSuccessTime = Date.now();
    state.failureCount = 0; // Reset failure count on success

    if (state.state === 'HALF_OPEN') {
      state.successCount++;
      if (state.successCount >= CIRCUIT_BREAKER_CONFIG.successThreshold) {
        state.state = 'CLOSED';
        state.successCount = 0;
        console.log(`✅ Circuit breaker ${this.identifier} transitioned to CLOSED`);
      }
    }
  }

  /**
   * Record failed operation
   */
  recordFailure(): void {
    const state = this.getState();
    state.lastFailureTime = Date.now();
    state.failureCount++;

    if (state.failureCount >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      state.state = 'OPEN';
      state.openUntil = Date.now() + CIRCUIT_BREAKER_CONFIG.timeout;
      console.error(`🚨 Circuit breaker ${this.identifier} OPENED due to ${state.failureCount} failures`);
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerState & { identifier: string } {
    return {
      identifier: this.identifier,
      ...this.getState()
    };
  }

  /**
   * Force circuit breaker to open (emergency mode)
   */
  forceOpen(durationMs: number = CIRCUIT_BREAKER_CONFIG.timeout): void {
    const state = this.getState();
    state.state = 'OPEN';
    state.openUntil = Date.now() + durationMs;
    console.error(`🚨 Circuit breaker ${this.identifier} FORCED OPEN for ${durationMs}ms`);
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    const state = this.getState();
    state.state = 'CLOSED';
    state.failureCount = 0;
    state.successCount = 0;
    delete state.openUntil;
    console.log(`🔄 Circuit breaker ${this.identifier} RESET to CLOSED`);
  }
}

/**
 * Global circuit breakers for different operation types
 */
export const globalCircuitBreakers = {
  neo4jWrite: new DatabaseCircuitBreaker('neo4j-write'),
  neo4jBatch: new DatabaseCircuitBreaker('neo4j-batch'),
  neo4jRead: new DatabaseCircuitBreaker('neo4j-read'),
};

/**
 * Record write operation metrics
 */
export function recordWriteOperationMetrics(
  clientId: string,
  operationType: string,
  success: boolean,
  executionTimeMs: number
): void {
  let metrics = writeMetricsStore.get(clientId);

  if (!metrics) {
    metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageExecutionTime: 0,
      lastOperationTime: 0,
      operationTypes: {}
    };
    writeMetricsStore.set(clientId, metrics);
  }

  // Update metrics
  metrics.totalOperations++;
  metrics.lastOperationTime = Date.now();
  metrics.operationTypes[operationType] = (metrics.operationTypes[operationType] || 0) + 1;

  if (success) {
    metrics.successfulOperations++;
  } else {
    metrics.failedOperations++;
  }

  // Update average execution time (simple moving average approximation)
  metrics.averageExecutionTime =
    (metrics.averageExecutionTime * (metrics.totalOperations - 1) + executionTimeMs) / metrics.totalOperations;
}

/**
 * Get write operation metrics for a client
 */
export function getWriteOperationMetrics(clientId: string): WriteOperationMetrics | null {
  return writeMetricsStore.get(clientId) || null;
}

/**
 * Detect anomalous write operation patterns
 */
export function detectAnomalousActivity(clientId: string): {
  isAnomalous: boolean;
  reasons: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
} {
  const metrics = getWriteOperationMetrics(clientId);
  const reasons: string[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  if (!metrics) {
    return { isAnomalous: false, reasons: [], severity: 'low' };
  }

  const now = Date.now();
  const recentActivityWindow = 5 * 60 * 1000; // 5 minutes
  const isRecentActivity = (now - metrics.lastOperationTime) < recentActivityWindow;

  // Check for high failure rate
  const failureRate = metrics.failedOperations / Math.max(metrics.totalOperations, 1);
  if (failureRate > 0.5 && metrics.totalOperations > 5) {
    reasons.push(`High failure rate: ${(failureRate * 100).toFixed(1)}%`);
    severity = 'high';
  }

  // Check for excessive operation frequency
  if (isRecentActivity && metrics.totalOperations > 50) {
    reasons.push(`Excessive operation frequency: ${metrics.totalOperations} operations recently`);
    severity = severity === 'high' ? 'critical' : 'medium';
  }

  // Check for unusual operation type distribution
  const writeOperations = (metrics.operationTypes['CREATE'] || 0) +
                          (metrics.operationTypes['MERGE'] || 0) +
                          (metrics.operationTypes['SET'] || 0);

  if (writeOperations > 30 && isRecentActivity) {
    reasons.push(`High write operation volume: ${writeOperations} write operations`);
    severity = severity === 'critical' ? 'critical' : 'medium';
  }

  // Check for performance issues
  if (metrics.averageExecutionTime > 5000) { // 5+ seconds average
    reasons.push(`Poor performance: ${metrics.averageExecutionTime.toFixed(0)}ms average execution time`);
    severity = severity === 'critical' ? 'critical' : 'medium';
  }

  return {
    isAnomalous: reasons.length > 0,
    reasons,
    severity
  };
}

/**
 * Emergency read-only mode activation
 */
let emergencyReadOnlyMode = false;
let readOnlyModeActivatedAt: number = 0;
let readOnlyModeReason: string = '';

export function activateEmergencyReadOnlyMode(reason: string, durationMs: number = 30 * 60 * 1000): void {
  emergencyReadOnlyMode = true;
  readOnlyModeActivatedAt = Date.now();
  readOnlyModeReason = reason;

  // Automatically deactivate after duration
  setTimeout(() => {
    deactivateEmergencyReadOnlyMode();
  }, durationMs);

  console.error(`🚨 EMERGENCY READ-ONLY MODE ACTIVATED: ${reason}`);

  // Force all circuit breakers open
  Object.values(globalCircuitBreakers).forEach(breaker => {
    breaker.forceOpen(durationMs);
  });
}

export function deactivateEmergencyReadOnlyMode(): void {
  emergencyReadOnlyMode = false;
  console.log(`✅ Emergency read-only mode deactivated`);

  // Reset all circuit breakers
  Object.values(globalCircuitBreakers).forEach(breaker => {
    breaker.reset();
  });
}

export function isInEmergencyReadOnlyMode(): boolean {
  return emergencyReadOnlyMode;
}

export function getEmergencyReadOnlyModeStatus(): {
  active: boolean;
  activatedAt?: number;
  reason?: string;
  durationMs?: number;
} {
  return {
    active: emergencyReadOnlyMode,
    activatedAt: readOnlyModeActivatedAt || undefined,
    reason: readOnlyModeReason || undefined,
    durationMs: emergencyReadOnlyMode ? Date.now() - readOnlyModeActivatedAt : undefined
  };
}

/**
 * Get comprehensive system monitoring status
 */
export function getSystemMonitoringStatus(): {
  circuitBreakers: Record<string, CircuitBreakerState & { identifier: string }>;
  emergencyMode: ReturnType<typeof getEmergencyReadOnlyModeStatus>;
  totalClients: number;
  anomalousClients: number;
  recentWriteOperations: number;
} {
  const circuitBreakers = Object.entries(globalCircuitBreakers).reduce((acc, [key, breaker]) => {
    acc[key] = breaker.getMetrics();
    return acc;
  }, {} as Record<string, CircuitBreakerState & { identifier: string }>);

  let anomalousClients = 0;
  let recentWriteOperations = 0;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  for (const [clientId, metrics] of Array.from(writeMetricsStore.entries())) {
    const anomaly = detectAnomalousActivity(clientId);
    if (anomaly.isAnomalous) {
      anomalousClients++;
    }

    if (metrics.lastOperationTime > fiveMinutesAgo) {
      recentWriteOperations += metrics.totalOperations;
    }
  }

  return {
    circuitBreakers,
    emergencyMode: getEmergencyReadOnlyModeStatus(),
    totalClients: writeMetricsStore.size,
    anomalousClients,
    recentWriteOperations
  };
}