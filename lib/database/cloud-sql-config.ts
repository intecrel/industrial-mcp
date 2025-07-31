/**
 * Google Cloud SQL configuration for Industrial MCP
 * Supports multiple databases (4 production + 1 staging) with SSL/TLS
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
 * Cloud SQL configuration based on your setup:
 * - 1 Enterprise Instance with HA
 * - 5 Databases (4 Production + 1 Staging)
 * - Public IP with Authorized Networks
 * - SSL/TLS with client certificates
 */
export function getCloudSQLConfig(): CloudSQLConfig {
  return {
    instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME || '',
    
    databases: {
      // Production databases
      industrial_prod: {
        name: 'industrial_mcp_prod',
        environment: 'production',
        description: 'Main industrial data and equipment records'
      },
      operational_prod: {
        name: 'operational_data_prod', 
        environment: 'production',
        description: 'Real-time operational metrics and sensor data'
      },
      maintenance_prod: {
        name: 'maintenance_records_prod',
        environment: 'production',  
        description: 'Equipment maintenance history and scheduling'
      },
      analytics_prod: {
        name: 'analytics_data_prod',
        environment: 'production',
        description: 'Historical analytics and reporting data'
      },
      
      // Staging database
      industrial_staging: {
        name: 'industrial_mcp_staging',
        environment: 'staging',
        description: 'Staging environment for testing and development'
      }
    },

    ssl: {
      ca: process.env.CLOUD_SQL_CA_CERT || './certs/server-ca.pem',
      cert: process.env.CLOUD_SQL_CLIENT_CERT || './certs/client-cert.pem', 
      key: process.env.CLOUD_SQL_CLIENT_KEY || './certs/client-key.pem',
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
  const username = process.env.CLOUD_SQL_USERNAME || 'industrial_mcp'
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
 * Get the primary production database configuration
 */
export function getPrimaryProductionConfig(): DatabaseConfig | null {
  const configs = createCloudSQLDatabaseConfigs()
  return configs.industrial_prod || null
}

/**
 * Get staging database configuration
 */
export function getStagingConfig(): DatabaseConfig | null {
  const configs = createCloudSQLDatabaseConfigs()
  return configs.industrial_staging || null
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