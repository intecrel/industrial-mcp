/**
 * Request validation and protection utilities
 */

export interface ValidationResult {
  valid: boolean
  errors: string[]
  sanitized?: any
  blocked?: boolean
  reason?: string
}

export interface RequestLimits {
  maxBodySize: number      // bytes
  maxQueryLength: number   // characters
  maxParamCount: number    // number of parameters
  maxHeaderSize: number    // bytes per header
}

export class RequestValidator {
  private static instance: RequestValidator
  private limits: RequestLimits

  private constructor() {
    this.limits = {
      maxBodySize: 10 * 1024 * 1024,    // 10MB
      maxQueryLength: 50000,             // 50k characters
      maxParamCount: 100,                // 100 parameters max
      maxHeaderSize: 8192                // 8KB per header
    }
  }

  static getInstance(): RequestValidator {
    if (!RequestValidator.instance) {
      RequestValidator.instance = new RequestValidator()
    }
    return RequestValidator.instance
  }

  /**
   * Comprehensive request validation
   */
  validateRequest(request: {
    method?: string
    headers?: Record<string, string>
    body?: any
    query?: any
    url?: string
  }): ValidationResult {
    const errors: string[] = []
    let blocked = false
    let reason = ''

    // Method validation
    if (request.method && !this.isAllowedMethod(request.method)) {
      errors.push(`HTTP method '${request.method}' not allowed`)
      blocked = true
      reason = 'Disallowed HTTP method'
    }

    // URL validation
    if (request.url && !this.isValidUrl(request.url)) {
      errors.push('Invalid or potentially dangerous URL pattern')
      blocked = true
      reason = 'Malicious URL pattern detected'
    }

    // Header validation
    if (request.headers) {
      const headerResult = this.validateHeaders(request.headers)
      if (!headerResult.valid) {
        errors.push(...headerResult.errors)
        if (headerResult.blocked) {
          blocked = true
          reason = 'Invalid or dangerous headers'
        }
      }
    }

    // Body size validation
    if (request.body && !this.isValidBodySize(request.body)) {
      errors.push(`Request body exceeds maximum size of ${this.limits.maxBodySize} bytes`)
      blocked = true
      reason = 'Request body too large'
    }

    // Query validation
    if (request.query) {
      const queryResult = this.validateQuery(request.query)
      if (!queryResult.valid) {
        errors.push(...queryResult.errors)
        if (queryResult.blocked) {
          blocked = true
          reason = 'Invalid or dangerous query parameters'
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      blocked,
      reason: blocked ? reason : undefined
    }
  }

  /**
   * SQL injection prevention
   */
  validateSqlQuery(sql: string): ValidationResult {
    const errors: string[] = []
    let blocked = false

    if (!sql || typeof sql !== 'string') {
      return { valid: false, errors: ['SQL query must be a non-empty string'] }
    }

    // Remove comments and normalize
    const normalized = sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')  // Block comments
      .replace(/--[^\r\n]*/g, ' ')       // Line comments
      .replace(/\s+/g, ' ')              // Multiple spaces
      .trim()

    // Dangerous SQL patterns
    const dangerousPatterns = [
      /\bUNION\s+(?:ALL\s+)?SELECT\b/i,
      /;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\b/i,
      /\bEXEC(?:UTE)?\s*\(/i,
      /\bsp_\w+/i,                        // Stored procedures
      /\bxp_\w+/i,                        // Extended procedures
      /\b(?:LOAD_FILE|INTO\s+(?:OUT|DUMP)FILE)\b/i,
      /\b(?:CHAR|ASCII|SUBSTRING|CONCAT)\s*\(/i, // String manipulation for blind injection
      /0x[0-9a-f]+/i,                     // Hex values often used in injection
      /\b(?:WAITFOR\s+DELAY|BENCHMARK\s*\()/i, // Time-based attacks
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(normalized)) {
        errors.push(`Potentially dangerous SQL pattern detected: ${pattern.source}`)
        blocked = true
      }
    }

    // Check for excessive UNION statements
    const unionCount = (normalized.match(/\bUNION\b/gi) || []).length
    if (unionCount > 2) {
      errors.push('Excessive UNION statements detected')
      blocked = true
    }

    return {
      valid: !blocked,
      errors,
      blocked,
      sanitized: blocked ? null : normalized,
      reason: blocked ? 'SQL injection attempt detected' : undefined
    }
  }

  /**
   * Cypher injection prevention
   */
  validateCypherQuery(cypher: string): ValidationResult {
    const errors: string[] = []
    let blocked = false

    if (!cypher || typeof cypher !== 'string') {
      return { valid: false, errors: ['Cypher query must be a non-empty string'] }
    }

    // Normalize query
    const normalized = cypher
      .replace(/\/\*[\s\S]*?\*\//g, ' ')  // Block comments
      .replace(/\/\/[^\r\n]*/g, ' ')      // Line comments
      .replace(/\s+/g, ' ')              // Multiple spaces
      .trim()

    // Dangerous Cypher patterns
    const dangerousPatterns = [
      /\bDROP\s+(?:DATABASE|INDEX|CONSTRAINT)\b/i,
      /\bCREATE\s+DATABASE\b/i,
      /\bALTER\s+DATABASE\b/i,
      /\bLOAD\s+CSV\s+FROM\s+["'][^"']*(?:file|http)/i, // File access
      /\bAPOC\.[a-zA-Z.]*(?:load|export|import)/i, // APOC procedures for file operations
      /\bCALL\s+db\.(?:shutdown|createDatabase|dropDatabase)/i,
      /\bCALL\s+dbms\.(?:shutdown|security|components)/i,
      // Dynamic query construction (potential injection)
      /\bAPOC\.cypher\.(?:doIt|run)/i,
      /\+\s*["'][^"']*\+/,                // String concatenation in queries
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(normalized)) {
        errors.push(`Potentially dangerous Cypher pattern detected: ${pattern.source}`)
        blocked = true
      }
    }

    // Check for excessive complexity
    if (normalized.length > this.limits.maxQueryLength) {
      errors.push(`Query exceeds maximum length of ${this.limits.maxQueryLength} characters`)
      blocked = true
    }

    return {
      valid: !blocked,
      errors,
      blocked,
      sanitized: blocked ? null : normalized,
      reason: blocked ? 'Cypher injection attempt detected' : undefined
    }
  }

  /**
   * Generic input sanitization
   */
  sanitizeInput(input: any, type: 'string' | 'number' | 'boolean' | 'object' = 'string'): any {
    if (input === null || input === undefined) {
      return null
    }

    switch (type) {
      case 'string':
        return this.sanitizeString(String(input))
      case 'number':
        const num = Number(input)
        return isNaN(num) ? null : num
      case 'boolean':
        return Boolean(input)
      case 'object':
        return this.sanitizeObject(input)
      default:
        return input
    }
  }

  /**
   * Rate limiting validation
   */
  validateRateLimit(identifier: string, limit: number, windowMs: number = 3600000): boolean {
    // This is a simple in-memory rate limiter
    // In production, you'd use Redis or similar
    const now = Date.now()
    const windowStart = now - windowMs
    
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map()
    }

    const requests = this.rateLimitStore.get(identifier) || []
    const validRequests = requests.filter((timestamp: number) => timestamp > windowStart)
    
    if (validRequests.length >= limit) {
      return false // Rate limit exceeded
    }

    validRequests.push(now)
    this.rateLimitStore.set(identifier, validRequests)
    
    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean up
      this.cleanupRateLimit(windowStart)
    }
    
    return true
  }

  private rateLimitStore?: Map<string, number[]>

  private isAllowedMethod(method: string): boolean {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']
    return allowedMethods.includes(method.toUpperCase())
  }

  private isValidUrl(url: string): boolean {
    // Check for dangerous URL patterns
    const dangerousPatterns = [
      /\.\.\//,                    // Path traversal
      /file:\/\//i,               // File protocol
      /javascript:/i,              // JavaScript protocol
      /data:/i,                   // Data URLs
      /vbscript:/i,               // VBScript
      /%00/,                      // Null byte
      /\x00/,                     // Null character
      /<script/i,                 // Script injection
      /on\w+\s*=/i,              // Event handlers
    ]

    return !dangerousPatterns.some(pattern => pattern.test(url))
  }

  private validateHeaders(headers: Record<string, string>): ValidationResult {
    const errors: string[] = []
    let blocked = false

    for (const [key, value] of Object.entries(headers)) {
      // Header size check
      if (key.length + value.length > this.limits.maxHeaderSize) {
        errors.push(`Header '${key}' exceeds maximum size`)
        blocked = true
      }

      // Check for injection in headers
      if (this.containsInjectionAttempt(value)) {
        errors.push(`Potentially dangerous content in header '${key}'`)
        blocked = true
      }

      // Check for suspicious headers
      if (this.isSuspiciousHeader(key, value)) {
        errors.push(`Suspicious header detected: '${key}'`)
        // Don't block, just warn
      }
    }

    return { valid: errors.length === 0, errors, blocked }
  }

  private validateQuery(query: any): ValidationResult {
    const errors: string[] = []
    let blocked = false

    if (typeof query === 'object' && query !== null) {
      const paramCount = Object.keys(query).length
      if (paramCount > this.limits.maxParamCount) {
        errors.push(`Too many query parameters: ${paramCount} (max: ${this.limits.maxParamCount})`)
        blocked = true
      }

      for (const [key, value] of Object.entries(query)) {
        if (typeof value === 'string' && this.containsInjectionAttempt(value)) {
          errors.push(`Potentially dangerous content in query parameter '${key}'`)
          blocked = true
        }
      }
    }

    return { valid: errors.length === 0, errors, blocked }
  }

  private isValidBodySize(body: any): boolean {
    const bodySize = JSON.stringify(body).length
    return bodySize <= this.limits.maxBodySize
  }

  private sanitizeString(str: string): string {
    return str
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/script/gi, '') // Remove script references
      .trim()
  }

  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return null
    if (typeof obj !== 'object') return obj
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }

    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = this.sanitizeString(key)
      sanitized[cleanKey] = typeof value === 'string' 
        ? this.sanitizeString(value)
        : this.sanitizeObject(value)
    }
    return sanitized
  }

  private containsInjectionAttempt(value: string): boolean {
    const injectionPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /\'\s*(?:OR|AND|UNION)\s*\'/i,
      /"\s*(?:OR|AND|UNION)\s*"/i,
      /1\s*=\s*1/i,
      /\'\s*=\s*\'/i,
      /".*"/,
      /\$\{.*\}/,  // Template literal injection
      /<%.*%>/,    // Template injection
    ]

    return injectionPatterns.some(pattern => pattern.test(value))
  }

  private isSuspiciousHeader(key: string, value: string): boolean {
    const suspiciousHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'x-originating-ip',
      'user-agent'
    ]

    if (suspiciousHeaders.includes(key.toLowerCase())) {
      // Check for suspicious values
      return /(?:curl|wget|python|script|bot)/i.test(value) ||
             value.length > 200 ||
             /[<>]/.test(value)
    }

    return false
  }

  private cleanupRateLimit(windowStart: number): void {
    if (!this.rateLimitStore) return
    
    Array.from(this.rateLimitStore.entries()).forEach(([key, requests]) => {
      const validRequests = requests.filter(timestamp => timestamp > windowStart)
      if (validRequests.length === 0) {
        this.rateLimitStore!.delete(key)
      } else {
        this.rateLimitStore!.set(key, validRequests)
      }
    })
  }
}

/**
 * Utility function to get request validator instance
 */
export const getRequestValidator = () => RequestValidator.getInstance()

/**
 * Middleware function for request validation
 */
export function validateRequest(request: any): ValidationResult {
  return getRequestValidator().validateRequest(request)
}

/**
 * SQL injection prevention
 */
export function validateSqlQuery(sql: string): ValidationResult {
  return getRequestValidator().validateSqlQuery(sql)
}

/**
 * Cypher injection prevention
 */
export function validateCypherQuery(cypher: string): ValidationResult {
  return getRequestValidator().validateCypherQuery(cypher)
}