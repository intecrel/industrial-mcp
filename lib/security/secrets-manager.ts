/**
 * Secrets management utility for secure credential handling
 */

export interface SecureCredential {
  value: string
  masked: string
  lastAccessed?: Date
  source: 'environment' | 'file' | 'external'
}

export class SecretsManager {
  private static instance: SecretsManager
  private credentials = new Map<string, SecureCredential>()
  
  private constructor() {}
  
  static getInstance(): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager()
    }
    return SecretsManager.instance
  }

  /**
   * Get a credential value securely
   */
  getSecret(key: string): string | undefined {
    const credential = this.credentials.get(key)
    if (credential) {
      credential.lastAccessed = new Date()
      return credential.value
    }

    // Fallback to environment variable
    const envValue = process.env[key]
    if (envValue) {
      this.credentials.set(key, {
        value: envValue,
        masked: this.maskValue(envValue),
        lastAccessed: new Date(),
        source: 'environment'
      })
      return envValue
    }

    return undefined
  }

  /**
   * Set a credential securely
   */
  setSecret(key: string, value: string, source: 'environment' | 'file' | 'external' = 'external'): void {
    if (!key || !value) {
      throw new Error('Key and value are required')
    }

    this.credentials.set(key, {
      value,
      masked: this.maskValue(value),
      lastAccessed: new Date(),
      source
    })
  }

  /**
   * Get masked credential for logging
   */
  getMaskedSecret(key: string): string | undefined {
    const credential = this.credentials.get(key)
    if (credential) {
      return credential.masked
    }

    const envValue = process.env[key]
    if (envValue) {
      return this.maskValue(envValue)
    }

    return undefined
  }

  /**
   * Validate that required secrets are available
   */
  validateRequiredSecrets(requiredKeys: string[]): { valid: boolean; missing: string[] } {
    const missing: string[] = []
    
    for (const key of requiredKeys) {
      if (!this.getSecret(key)) {
        missing.push(key)
      }
    }

    return {
      valid: missing.length === 0,
      missing
    }
  }

  /**
   * Get connection string with masked credentials
   */
  getMaskedConnectionString(connectionString: string): string {
    // Pattern: protocol://username:password@host:port/database
    return connectionString.replace(
      /:([^:@]+)@/g, 
      ':***@'
    )
  }

  /**
   * Clear all cached credentials (for cleanup)
   */
  clearCache(): void {
    this.credentials.clear()
  }

  /**
   * Get security audit information
   */
  getSecurityAudit(): {
    totalSecrets: number
    secretsBySource: Record<string, number>
    lastAccessed: Record<string, Date>
  } {
    const secretsBySource: Record<string, number> = {
      environment: 0,
      file: 0,
      external: 0
    }
    const lastAccessed: Record<string, Date> = {}

    Array.from(this.credentials.entries()).forEach(([key, credential]) => {
      secretsBySource[credential.source]++
      if (credential.lastAccessed) {
        lastAccessed[key] = credential.lastAccessed
      }
    })

    return {
      totalSecrets: this.credentials.size,
      secretsBySource,
      lastAccessed
    }
  }

  private maskValue(value: string): string {
    if (!value || value.length <= 4) {
      return '***'
    }

    // For connection strings or URLs
    if (value.includes('://')) {
      return this.getMaskedConnectionString(value)
    }

    // For API keys or tokens
    if (value.length > 20) {
      return value.substring(0, 8) + '...' + value.substring(value.length - 4)
    }

    // For passwords
    return value.substring(0, 2) + '*'.repeat(Math.min(value.length - 4, 6)) + value.substring(value.length - 2)
  }
}

/**
 * Utility function to get secrets manager instance
 */
export const getSecretsManager = () => SecretsManager.getInstance()

/**
 * Database configuration helper with secure credential handling
 */
export interface SecureDatabaseConfig {
  type: 'mysql' | 'neo4j'
  host?: string
  port?: number
  database?: string
  uri?: string
  username?: string
  password?: string
  ssl?: boolean | object
  maxConnections?: number
  timeout?: number
}

export function createSecureDatabaseConfig(
  type: 'mysql' | 'neo4j',
  envPrefix: string
): SecureDatabaseConfig {
  const secrets = getSecretsManager()
  
  const config: SecureDatabaseConfig = {
    type,
    host: secrets.getSecret(`${envPrefix}_HOST`),
    port: parseInt(secrets.getSecret(`${envPrefix}_PORT`) || '0') || undefined,
    database: secrets.getSecret(`${envPrefix}_DATABASE`),
    uri: secrets.getSecret(`${envPrefix}_URI`),
    username: secrets.getSecret(`${envPrefix}_USERNAME`),
    password: secrets.getSecret(`${envPrefix}_PASSWORD`),
    maxConnections: parseInt(secrets.getSecret(`${envPrefix}_MAX_CONNECTIONS`) || '10'),
    timeout: parseInt(secrets.getSecret(`${envPrefix}_TIMEOUT`) || '60000')
  }

  // Validate required credentials
  const requiredKeys = [`${envPrefix}_USERNAME`, `${envPrefix}_PASSWORD`]
  const validation = secrets.validateRequiredSecrets(requiredKeys)
  
  if (!validation.valid) {
    throw new Error(`Missing required database credentials: ${validation.missing.join(', ')}`)
  }

  // Security logging
  const maskedUri = config.uri ? secrets.getMaskedConnectionString(config.uri) : undefined
  const maskedHost = config.host ? `${config.host}:***` : undefined
  
  console.log(`🔧 Database config created for ${type}: ${maskedUri || maskedHost}`)

  return config
}