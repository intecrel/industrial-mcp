/**
 * Database Manager - Central hub for managing multiple database connections
 */

import { DatabaseConnection, DatabaseConfig, DatabaseType, QueryResult } from './types'
import { Neo4jConnection } from './neo4j-connection'
import { MySQLConnection } from './mysql-connection'

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
   * Initialize all configured database connections
   */
  async initialize(): Promise<void> {
    const connectionPromises = Object.entries(this.config.connections).map(
      async ([name, config]) => {
        try {
          const connection = this.createConnection(config)
          await connection.connect()
          this.connections.set(name, connection)
          console.log(`✅ Database connection '${name}' (${config.type}) initialized`)
        } catch (error) {
          console.error(`❌ Failed to initialize connection '${name}' (${config.type}):`, error)
          throw error
        }
      }
    )

    await Promise.all(connectionPromises)
    console.log(`✅ Database Manager initialized with ${this.connections.size} connections`)
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
    params?: any[],
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
   * Create database manager from environment variables
   */
  static fromEnvironment(): DatabaseManager {
    const connections: { [key: string]: DatabaseConfig } = {}

    // Neo4j connection (always available)
    connections.neo4j = {
      type: 'neo4j',
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      maxConnections: parseInt(process.env.NEO4J_MAX_CONNECTIONS || '50', 10),
      timeout: parseInt(process.env.NEO4J_TIMEOUT || '60000', 10)
    }

    // Local MySQL connection (if configured)
    if (process.env.MYSQL_HOST || process.env.DATABASE_URL?.includes('mysql')) {
      connections.mysql = {
        type: 'mysql',
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        database: process.env.MYSQL_DATABASE || 'industrial_mcp',
        username: process.env.MYSQL_USERNAME || process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD,
        ssl: process.env.MYSQL_SSL === 'true',
        maxConnections: parseInt(process.env.MYSQL_MAX_CONNECTIONS || '10', 10),
        timeout: parseInt(process.env.MYSQL_TIMEOUT || '60000', 10)
      }
    }

    // Cloud SQL configurations (Google Cloud Enterprise HA setup)
    if (process.env.CLOUD_SQL_HOST && process.env.CLOUD_SQL_PASSWORD) {
      const cloudSQLConfig = {
        host: process.env.CLOUD_SQL_HOST,
        port: parseInt(process.env.CLOUD_SQL_PORT || '3306', 10),
        username: process.env.CLOUD_SQL_USERNAME || 'industrial_mcp',
        password: process.env.CLOUD_SQL_PASSWORD,
        maxConnections: parseInt(process.env.CLOUD_SQL_MAX_CONNECTIONS || '5', 10),
        timeout: parseInt(process.env.CLOUD_SQL_TIMEOUT || '30000', 10),
        ssl: {
          ca: process.env.CLOUD_SQL_CA_CERT || './certs/server-ca.pem',
          cert: process.env.CLOUD_SQL_CLIENT_CERT || './certs/client-cert.pem',
          key: process.env.CLOUD_SQL_CLIENT_KEY || './certs/client-key.pem',
          rejectUnauthorized: true
        }
      }

      // Production databases
      connections.industrial_prod = {
        type: 'mysql',
        ...cloudSQLConfig,
        database: process.env.CLOUD_SQL_DB_INDUSTRIAL || 'industrial_mcp_prod'
      }

      connections.operational_prod = {
        type: 'mysql',
        ...cloudSQLConfig,
        database: process.env.CLOUD_SQL_DB_OPERATIONAL || 'operational_data_prod'
      }

      connections.maintenance_prod = {
        type: 'mysql',
        ...cloudSQLConfig,
        database: process.env.CLOUD_SQL_DB_MAINTENANCE || 'maintenance_records_prod'
      }

      connections.analytics_prod = {
        type: 'mysql',
        ...cloudSQLConfig,
        database: process.env.CLOUD_SQL_DB_ANALYTICS || 'analytics_data_prod'
      }

      // Staging database
      connections.industrial_staging = {
        type: 'mysql',
        ...cloudSQLConfig,
        database: process.env.CLOUD_SQL_DB_STAGING || 'industrial_mcp_staging',
        maxConnections: 3 // Lower connection limit for staging
      }
    }

    // Legacy Cloud SQL connection name support (Unix socket)
    if (process.env.CLOUD_SQL_CONNECTION_NAME && !process.env.CLOUD_SQL_HOST) {
      connections.cloudsql_legacy = {
        type: 'mysql',
        host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
        database: process.env.CLOUD_SQL_DATABASE || 'industrial_mcp',
        username: process.env.CLOUD_SQL_USERNAME || 'root',
        password: process.env.CLOUD_SQL_PASSWORD,
        ssl: false, // Unix socket connection
        maxConnections: parseInt(process.env.CLOUD_SQL_MAX_CONNECTIONS || '5', 10)
      }
    }

    // Determine default connection based on environment
    let defaultConnection = process.env.DEFAULT_DATABASE || 'neo4j'
    
    // Auto-select primary production database if available
    if (connections.industrial_prod && process.env.NODE_ENV === 'production') {
      defaultConnection = 'industrial_prod'
    } else if (connections.industrial_staging && process.env.NODE_ENV !== 'production') {
      defaultConnection = 'industrial_staging'
    }

    return new DatabaseManager({
      connections,
      defaultConnection
    })
  }
}