/**
 * Database Manager - Central hub for managing multiple database connections
 */

import { DatabaseConnection, DatabaseConfig, DatabaseType, QueryResult } from './types'
import { Neo4jConnection } from './neo4j-connection'
import { MySQLConnection } from './mysql-connection'
import { getSecretsManager, createSecureDatabaseConfig } from '../security/secrets-manager'
import { auditDatabaseSecurity, generateSecurityReport } from '../security/database-security'

export interface DatabaseManagerConfig {
  connections: {
    [key: string]: DatabaseConfig
  }
  defaultConnection?: string
}

export class DatabaseManager {
  private connections: Map<string, DatabaseConnection> = new Map()
  private config: DatabaseManagerConfig
  private _defaultConnection?: string

  constructor(config: DatabaseManagerConfig) {
    this.config = config
    this._defaultConnection = config.defaultConnection
  }

  /**
   * Initialize all configured database connections with security audit
   */
  async initialize(): Promise<void> {
    // Security: Run database security audit before initialization
    console.log('🔒 Running database security audit...')
    const securityAudit = await auditDatabaseSecurity()
    
    if (securityAudit.critical) {
      console.error('❌ CRITICAL SECURITY ISSUES DETECTED:')
      securityAudit.checks
        .filter(check => !check.passed && check.severity === 'critical')
        .forEach(check => console.error(`  ❌ ${check.name}: ${check.message}`))
      throw new Error('Critical security issues must be resolved before database initialization')
    }
    
    if (securityAudit.score < 70) {
      console.warn(`⚠️ Security score: ${securityAudit.score}/100 - Consider implementing security recommendations`)
    } else {
      console.log(`✅ Security audit passed: ${securityAudit.score}/100`)
    }

    const connectionPromises = Object.entries(this.config.connections).map(
      async ([name, config]) => {
        try {
          const connection = this.createConnection(config)
          await connection.connect()
          this.connections.set(name, connection)
          console.log(`✅ Database connection '${name}' (${config.type}) initialized`)
          return { name, success: true }
        } catch (error) {
          console.warn(`⚠️ Failed to initialize connection '${name}' (${config.type}):`, error instanceof Error ? error.message : String(error))
          return { name, success: false, error }
        }
      }
    )

    const results = await Promise.all(connectionPromises)
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    
    console.log(`✅ Database Manager initialized with ${successful.length}/${results.length} connections`)
    if (failed.length > 0) {
      console.log(`⚠️ Failed connections: ${failed.map(f => f.name).join(', ')}`)
    }
    
    // Log security report in development
    if (process.env.NODE_ENV !== 'production') {
      const report = await generateSecurityReport()
      console.log('\n' + report)
    }
    
    // Only throw error if NO connections were successful
    if (successful.length === 0) {
      throw new Error(`Failed to initialize any database connections. Errors: ${failed.map(f => `${f.name}: ${f.error}`).join('; ')}`)
    }
  }

  /**
   * Gracefully close all database connections
   */
  async shutdown(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.entries()).map(
      async ([name, connection]) => {
        try {
          await connection.disconnect()
          console.log(`✅ Database connection '${name}' closed`)
        } catch (error) {
          console.error(`❌ Error closing connection '${name}':`, error)
        }
      }
    )

    await Promise.all(disconnectPromises)
    this.connections.clear()
    console.log('✅ Database Manager shutdown complete')
  }

  /**
   * Get a specific database connection by name
   */
  getConnection(name?: string): DatabaseConnection {
    const connectionName = name || this._defaultConnection
    
    if (!connectionName) {
      throw new Error('No connection name specified and no default connection configured')
    }

    const connection = this.connections.get(connectionName)
    if (!connection) {
      throw new Error(`Database connection '${connectionName}' not found`)
    }

    if (!connection.isConnected) {
      throw new Error(`Database connection '${connectionName}' is not connected`)
    }

    return connection
  }

  /**
   * Get all available connection names
   */
  getConnectionNames(): string[] {
    return Array.from(this.connections.keys())
  }

  /**
   * Check if a connection exists and is healthy
   */
  async isConnectionHealthy(name: string): Promise<boolean> {
    try {
      const connection = this.connections.get(name)
      return connection ? await connection.ping() : false
    } catch {
      return false
    }
  }

  /**
   * Get health status of all connections
   */
  async getHealthStatus(): Promise<Record<string, { healthy: boolean; type: DatabaseType; error?: string }>> {
    const status: Record<string, { healthy: boolean; type: DatabaseType; error?: string }> = {}

    const healthChecks = Array.from(this.connections.entries()).map(
      async ([name, connection]) => {
        try {
          const healthy = await connection.ping()
          status[name] = { healthy, type: connection.type }
        } catch (error) {
          status[name] = {
            healthy: false,
            type: connection.type,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
    )

    await Promise.all(healthChecks)
    return status
  }

  /**
   * Execute a query on a specific connection
   */
  async query<T = any>(
    query: string,
    params?: any[] | Record<string, any>,
    connectionName?: string
  ): Promise<QueryResult<T>> {
    const connection = this.getConnection(connectionName)
    return connection.query<T>(query, params)
  }

  /**
   * Execute a transaction across multiple operations
   */
  async transaction<T>(
    operations: (connection: DatabaseConnection) => Promise<T>,
    connectionName?: string
  ): Promise<T> {
    const connection = this.getConnection(connectionName)

    await connection.beginTransaction()
    try {
      const result = await operations(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback()
      throw error
    }
  }

  /**
   * Create a database connection instance based on type
   */
  private createConnection(config: DatabaseConfig): DatabaseConnection {
    switch (config.type) {
      case 'neo4j':
        return new Neo4jConnection(config)
      case 'mysql':
        return new MySQLConnection(config)
      case 'postgresql':
        // TODO: Implement PostgreSQL connection
        throw new Error('PostgreSQL connection not yet implemented')
      case 'sqlite':
        // TODO: Implement SQLite connection
        throw new Error('SQLite connection not yet implemented')
      default:
        throw new Error(`Unsupported database type: ${config.type}`)
    }
  }

  /**
   * Add a new connection at runtime
   */
  async addConnection(name: string, config: DatabaseConfig): Promise<void> {
    if (this.connections.has(name)) {
      throw new Error(`Connection '${name}' already exists`)
    }

    const connection = this.createConnection(config)
    await connection.connect()
    this.connections.set(name, connection)

    console.log(`✅ Added database connection '${name}' (${config.type})`)
  }

  /**
   * Remove a connection at runtime
   */
  async removeConnection(name: string): Promise<void> {
    const connection = this.connections.get(name)
    if (!connection) {
      throw new Error(`Connection '${name}' not found`)
    }

    await connection.disconnect()
    this.connections.delete(name)

    console.log(`✅ Removed database connection '${name}'`)
  }

  /**
   * Get database security status
   */
  async getSecurityStatus(): Promise<{
    audit: any
    report: string
    healthStatus: Record<string, { healthy: boolean; type: DatabaseType; error?: string }>
  }> {
    const [audit, report, healthStatus] = await Promise.all([
      auditDatabaseSecurity(),
      generateSecurityReport(),
      this.getHealthStatus()
    ])

    return { audit, report, healthStatus }
  }

  /**
   * Create database manager from environment variables with enhanced security
   */
  static fromEnvironment(): DatabaseManager {
    const connections: { [key: string]: DatabaseConfig } = {}
    const secrets = getSecretsManager()

    // Security: Validate required environment variables upfront
    const requiredSecrets = ['NEO4J_USERNAME', 'NEO4J_PASSWORD']
    const validation = secrets.validateRequiredSecrets(requiredSecrets)
    
    if (!validation.valid) {
      console.warn(`⚠️ Missing database credentials: ${validation.missing.join(', ')}`)
    }

    // Neo4j connection with secure configuration
    try {
      connections.neo4j = createSecureDatabaseConfig('neo4j', 'NEO4J')
    } catch (error) {
      // Fallback to basic configuration for development
      connections.neo4j = {
        type: 'neo4j',
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        username: process.env.NEO4J_USERNAME || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
        maxConnections: parseInt(process.env.NEO4J_MAX_CONNECTIONS || '50', 10),
        timeout: parseInt(process.env.NEO4J_TIMEOUT || '60000', 10)
      }
      console.warn('⚠️ Using fallback Neo4j configuration:', error instanceof Error ? error.message : String(error))
    }

    // Local MySQL connection with secure configuration (if configured)
    if (process.env.MYSQL_HOST || process.env.DATABASE_URL?.includes('mysql')) {
      try {
        connections.mysql = createSecureDatabaseConfig('mysql', 'MYSQL')
      } catch (error) {
        // Fallback to basic configuration
        connections.mysql = {
          type: 'mysql',
          host: process.env.MYSQL_HOST || 'localhost',
          port: parseInt(process.env.MYSQL_PORT || '3306', 10),
          database: process.env.MYSQL_DATABASE || 'industrial_mcp',
          username: process.env.MYSQL_USERNAME || process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD,
          ssl: process.env.NODE_ENV === 'production', // Auto-enable SSL in production
          maxConnections: parseInt(process.env.MYSQL_MAX_CONNECTIONS || '10', 10),
          timeout: parseInt(process.env.MYSQL_TIMEOUT || '60000', 10)
        }
        console.warn('⚠️ Using fallback MySQL configuration:', error instanceof Error ? error.message : String(error))
      }
    }

    // Cloud SQL configurations with enhanced security (Google Cloud Enterprise HA setup)
    if (process.env.CLOUD_SQL_HOST && process.env.CLOUD_SQL_PASSWORD) {
      const cloudSQLConfig = {
        host: process.env.CLOUD_SQL_HOST,
        port: parseInt(process.env.CLOUD_SQL_PORT || '3306', 10),
        username: secrets.getSecret('CLOUD_SQL_USERNAME') || 'mcp_user',
        password: secrets.getSecret('CLOUD_SQL_PASSWORD'),
        maxConnections: parseInt(process.env.CLOUD_SQL_MAX_CONNECTIONS || '5', 10),
        timeout: parseInt(process.env.CLOUD_SQL_TIMEOUT || '30000', 10),
        ssl: {
          ca: process.env.CLOUD_SQL_CA_CERT,
          cert: process.env.CLOUD_SQL_CLIENT_CERT,
          key: process.env.CLOUD_SQL_CLIENT_KEY,
          rejectUnauthorized: true, // Security: Always validate certificates
          secureProtocol: 'TLSv1_2_method' // Security: Force TLS 1.2+
        }
      }
      
      // Security: Log masked connection info
      console.log(`🔒 Cloud SQL configuration: ${secrets.getMaskedConnectionString(`mysql://${cloudSQLConfig.username}@${cloudSQLConfig.host}:${cloudSQLConfig.port}`)}`)

      // Primary database (configure via environment variable)
      if (process.env.CLOUD_SQL_DB_PRIMARY) {
        connections.cloud_sql_primary = {
          type: 'mysql',
          ...cloudSQLConfig,
          database: process.env.CLOUD_SQL_DB_PRIMARY
        }
      }

      // Staging database (configure via environment variable)
      if (process.env.CLOUD_SQL_DB_STAGING) {
        connections.cloud_sql_staging = {
          type: 'mysql',
          ...cloudSQLConfig,
          database: process.env.CLOUD_SQL_DB_STAGING,
          maxConnections: 3 // Lower connection limit for staging
        }
      }
    }

    // Cloud SQL Connector support with enhanced security (Serverless/Unix socket)
    if (process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME && !process.env.CLOUD_SQL_HOST) {
      connections.cloudsql_connector = {
        type: 'mysql',
        database: secrets.getSecret('CLOUD_SQL_DATABASE_NAME') || 'mcp_database',
        username: secrets.getSecret('CLOUD_SQL_USERNAME') || 'root',
        password: secrets.getSecret('CLOUD_SQL_PASSWORD'),
        ssl: false, // Cloud SQL Connector handles encryption
        maxConnections: parseInt(process.env.CLOUD_SQL_MAX_CONNECTIONS || '5', 10),
        timeout: parseInt(process.env.CLOUD_SQL_TIMEOUT || '30000', 10)
      }
      
      // Security: Log masked connection info
      const instanceName = process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME
      console.log(`🔒 Cloud SQL Connector: ${instanceName} (IAM authenticated)`)
    }

    // Determine default connection based on environment
    let defaultConnection = process.env.DEFAULT_DATABASE || 'neo4j'
    
    // Auto-select primary database if available
    if (connections.cloud_sql_primary && process.env.NODE_ENV === 'production') {
      defaultConnection = 'cloud_sql_primary'
    } else if (connections.cloud_sql_staging && process.env.NODE_ENV !== 'production') {
      defaultConnection = 'cloud_sql_staging'
    } else if (connections.mysql && process.env.NODE_ENV !== 'production') {
      // Use local MySQL connection in development
      defaultConnection = 'mysql'
    }
    

    return new DatabaseManager({
      connections,
      defaultConnection
    })
  }
}