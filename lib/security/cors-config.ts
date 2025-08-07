/**
 * CORS configuration and security headers
 */

export interface CORSConfig {
  origins: string[] | '*'
  methods: string[]
  headers: string[]
  credentials: boolean
  maxAge: number
  optionsSuccessStatus: number
}

export interface SecurityHeaders {
  [key: string]: string
}

export class CORSManager {
  private static instance: CORSManager
  
  private constructor() {}
  
  static getInstance(): CORSManager {
    if (!CORSManager.instance) {
      CORSManager.instance = new CORSManager()
    }
    return CORSManager.instance
  }

  /**
   * Get CORS configuration based on environment
   */
  getCORSConfig(environment: 'development' | 'production' | 'test' = 'production'): CORSConfig {
    switch (environment) {
      case 'development':
        return {
          origins: [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001'
          ],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
          headers: [
            'Content-Type',
            'Authorization',
            'x-api-key',
            'Accept',
            'Origin',
            'X-Requested-With'
          ],
          credentials: true,
          maxAge: 86400, // 24 hours
          optionsSuccessStatus: 200
        }

      case 'production':
        return {
          origins: [
            'https://industrial-mcp-delta.vercel.app',
            'https://claude.ai',
            'https://*.claude.ai',
            // Add other allowed production origins
          ],
          methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
          headers: [
            'Content-Type',
            'Authorization',
            'x-api-key',
            'Accept'
          ],
          credentials: false, // More secure for production
          maxAge: 3600, // 1 hour
          optionsSuccessStatus: 204
        }

      case 'test':
        return {
          origins: ['http://localhost:3000'],
          methods: ['GET', 'POST', 'OPTIONS'],
          headers: ['Content-Type', 'x-api-key'],
          credentials: false,
          maxAge: 300, // 5 minutes
          optionsSuccessStatus: 200
        }

      default:
        return this.getCORSConfig('production')
    }
  }

  /**
   * Get comprehensive security headers
   */
  getSecurityHeaders(environment: 'development' | 'production' | 'test' = 'production'): SecurityHeaders {
    const baseHeaders: SecurityHeaders = {
      // CORS headers will be set separately
      
      // Security headers
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      
      // Cache control
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    }

    if (environment === 'production') {
      baseHeaders['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
      baseHeaders['Content-Security-Policy'] = this.getCSPHeader('production')
    } else if (environment === 'development') {
      baseHeaders['Content-Security-Policy'] = this.getCSPHeader('development')
    }

    return baseHeaders
  }

  /**
   * Validate origin against allowed origins
   */
  isValidOrigin(origin: string | undefined, allowedOrigins: string[] | '*'): boolean {
    if (!origin) return false
    if (allowedOrigins === '*') return true
    if (Array.isArray(allowedOrigins)) {
      return allowedOrigins.some(allowed => {
        if (allowed.includes('*')) {
          // Handle wildcard patterns like *.claude.ai
          const regex = new RegExp('^' + allowed.replace(/\*/g, '.*') + '$')
          return regex.test(origin)
        }
        return allowed === origin
      })
    }
    return false
  }

  /**
   * Set CORS headers on response
   */
  setCORSHeaders(
    request: { method?: string; headers?: { origin?: string } },
    response: { setHeader?: (key: string, value: string) => void; headers?: { set: (key: string, value: string) => void } },
    config?: CORSConfig
  ): void {
    const corsConfig = config || this.getCORSConfig(process.env.NODE_ENV as any)
    const origin = request.headers?.origin

    // Helper function to set headers on both response types
    const setHeader = (key: string, value: string) => {
      if (response.setHeader) {
        response.setHeader(key, value)
      } else if (response.headers?.set) {
        response.headers.set(key, value)
      }
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      if (origin && this.isValidOrigin(origin, corsConfig.origins)) {
        setHeader('Access-Control-Allow-Origin', origin)
      } else if (corsConfig.origins === '*') {
        setHeader('Access-Control-Allow-Origin', '*')
      }

      setHeader('Access-Control-Allow-Methods', corsConfig.methods.join(', '))
      setHeader('Access-Control-Allow-Headers', corsConfig.headers.join(', '))
      setHeader('Access-Control-Max-Age', corsConfig.maxAge.toString())
      
      if (corsConfig.credentials) {
        setHeader('Access-Control-Allow-Credentials', 'true')
      }
      
      return
    }

    // Handle actual requests
    if (origin && this.isValidOrigin(origin, corsConfig.origins)) {
      setHeader('Access-Control-Allow-Origin', origin)
      setHeader('Vary', 'Origin')
    } else if (corsConfig.origins === '*') {
      setHeader('Access-Control-Allow-Origin', '*')
    }

    if (corsConfig.credentials) {
      setHeader('Access-Control-Allow-Credentials', 'true')
    }

    // Expose headers that clients can access
    setHeader('Access-Control-Expose-Headers', 'Content-Length, Date, Server, X-RateLimit-*')
  }

  /**
   * Set security headers on response
   */
  setSecurityHeaders(
    response: { setHeader?: (key: string, value: string) => void; headers?: { set: (key: string, value: string) => void } },
    environment?: 'development' | 'production' | 'test'
  ): void {
    const headers = this.getSecurityHeaders(environment)
    
    // Helper function to set headers on both response types
    const setHeader = (key: string, value: string) => {
      if (response.setHeader) {
        response.setHeader(key, value)
      } else if (response.headers?.set) {
        response.headers.set(key, value)
      }
    }
    
    Object.entries(headers).forEach(([key, value]) => {
      setHeader(key, value)
    })
  }

  private getCSPHeader(environment: 'development' | 'production'): string {
    const basePolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Needed for Next.js
      "style-src 'self' 'unsafe-inline'",  // Needed for Tailwind
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ]

    if (environment === 'development') {
      // Add localhost for development
      basePolicy[4] = "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*"
    } else {
      // Production: only allow secure connections
      basePolicy[4] = "connect-src 'self' https:"
    }

    return basePolicy.join('; ')
  }
}

/**
 * Utility functions
 */
export const getCORSManager = () => CORSManager.getInstance()

export function applyCORSHeaders(
  request: any,
  response: any,
  environment?: 'development' | 'production' | 'test'
): void {
  const manager = getCORSManager()
  const config = manager.getCORSConfig(environment || process.env.NODE_ENV as any)
  
  manager.setCORSHeaders(request, response, config)
  manager.setSecurityHeaders(response, environment || process.env.NODE_ENV as any)
}