/**
 * Google Cloud SQL configuration for MCP
 * Flexible configuration for any MySQL database structure with SSL/TLS
 */

import { DatabaseConfig } from './types'

export interface CloudSQLConfig {
  instanceConnectionName: string
  databases: {
    [key: string]: {
      name: string
      environment: 'production' | 'staging'
      description: string
    }
  }
  ssl: {
    ca: string
    cert: string
    key: string
    rejectUnauthorized: boolean
  }
  connection: {
    maxConnections: number
    timeout: number
    charset: string
  }
}

/**
 * Cloud SQL configuration:
 * - Enterprise Instance with HA
 * - Flexible database support (adapts to your data structure)
 * - Public IP with Authorized Networks
 * - SSL/TLS with client certificates
 */
export function getCloudSQLConfig(): CloudSQLConfig {
  return {
    instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME || '',
    
    databases: {
      // Primary database - configure via environment variable
      cloud_sql_primary: {
        name: process.env.CLOUD_SQL_DB_PRIMARY || '',
        environment: 'production',
        description: 'Primary database with your data'
      },
      
      // Staging database - configure via environment variable
      cloud_sql_staging: {
        name: process.env.CLOUD_SQL_DB_STAGING || '',
        environment: 'staging',
        description: 'Staging environment for testing and development'
      }
    },

    ssl: {
      ca: process.env.CLOUD_SQL_CA_CERT || '',
      cert: process.env.CLOUD_SQL_CLIENT_CERT || '',
      key: process.env.CLOUD_SQL_CLIENT_KEY || '',
      rejectUnauthorized: true // Enforce SSL certificate validation
    },

    connection: {
      maxConnections: parseInt(process.env.CLOUD_SQL_MAX_CONNECTIONS || '5', 10),
      timeout: parseInt(process.env.CLOUD_SQL_TIMEOUT || '30000', 10),
      charset: 'utf8mb4'
    }
  }
}

/**
 * Create database configurations for all Cloud SQL databases
 */
export function createCloudSQLDatabaseConfigs(): Record<string, DatabaseConfig> {
  const config = getCloudSQLConfig()
  const configs: Record<string, DatabaseConfig> = {}

  // Get common connection details
  const host = process.env.CLOUD_SQL_HOST || process.env.CLOUD_SQL_IP
  const port = parseInt(process.env.CLOUD_SQL_PORT || '3306', 10)
  const username = process.env.CLOUD_SQL_USERNAME || 'mcp_user'
  const password = process.env.CLOUD_SQL_PASSWORD

  if (!host || !password) {
    console.warn('⚠️ Cloud SQL configuration incomplete. Missing host or password.')
    return configs
  }

  // Create configuration for each database
  Object.entries(config.databases).forEach(([key, dbConfig]) => {
    configs[key] = {
      type: 'mysql',
      host: host,
      port: port,
      database: dbConfig.name,
      username: username,
      password: password,
      maxConnections: config.connection.maxConnections,
      timeout: config.connection.timeout,
      ssl: config.ssl
    }
  })

  return configs
}

/**
 * Get the primary database configuration
 */
export function getPrimaryConfig(): DatabaseConfig | null {
  const configs = createCloudSQLDatabaseConfigs()
  return configs.cloud_sql_primary || null
}

/**
 * Get staging database configuration
 */
export function getStagingConfig(): DatabaseConfig | null {
  const configs = createCloudSQLDatabaseConfigs()
  return configs.cloud_sql_staging || null
}

/**
 * Get configuration for specific environment
 */
export function getConfigForEnvironment(env: 'production' | 'staging'): Record<string, DatabaseConfig> {
  const allConfigs = createCloudSQLDatabaseConfigs()
  const config = getCloudSQLConfig()
  
  const envConfigs: Record<string, DatabaseConfig> = {}
  
  Object.entries(allConfigs).forEach(([key, dbConfig]) => {
    const dbInfo = config.databases[key]
    if (dbInfo && dbInfo.environment === env) {
      envConfigs[key] = dbConfig
    }
  })
  
  return envConfigs
}

/**
 * Validate Cloud SQL configuration
 */
export function validateCloudSQLConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Check required environment variables
  const required = [
    'CLOUD_SQL_HOST',
    'CLOUD_SQL_USERNAME', 
    'CLOUD_SQL_PASSWORD'
  ]
  
  required.forEach(envVar => {
    if (!process.env[envVar]) {
      errors.push(`Missing required environment variable: ${envVar}`)
    }
  })
  
  // Check SSL certificate paths
  const config = getCloudSQLConfig()
  const certPaths = [config.ssl.ca, config.ssl.cert, config.ssl.key]
  
  certPaths.forEach(certPath => {
    if (certPath && !process.env[certPath.replace('./certs/', '').replace('.pem', '').toUpperCase().replace('-', '_')]) {
      console.warn(`⚠️ SSL certificate path not found in environment: ${certPath}`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Connection test helper
 */
export function getConnectionTestQuery(): string {
  return `
    SELECT 
      CONNECTION_ID() as connection_id,
      USER() as current_user,
      DATABASE() as current_database,
      VERSION() as mysql_version,
      @@ssl_cipher as ssl_cipher,
      NOW() as server_time
  `
}

/**
 * Security verification query
 */
export function getSecurityCheckQuery(): string {
  return `
    SELECT 
      VARIABLE_NAME,
      VARIABLE_VALUE
    FROM performance_schema.session_status 
    WHERE VARIABLE_NAME IN (
      'Ssl_cipher',
      'Ssl_version', 
      'Ssl_verify_mode',
      'Ssl_verify_depth'
    )
    ORDER BY VARIABLE_NAME
  `
}