/**
 * MySQL database connection implementation with Cloud SQL support
 */

import mysql from 'mysql2/promise'
import { BaseDatabaseConnection } from './base'
import { DatabaseConfig, QueryResult, TableSchema } from './types'
import fs from 'fs'
import path from 'path'

// Import Cloud SQL Connector
import { Connector } from '@google-cloud/cloud-sql-connector'

interface MySQLConfig extends DatabaseConfig {
  multipleStatements?: boolean
  charset?: string
  acquireTimeout?: number
  reconnect?: boolean
}

export class MySQLConnection extends BaseDatabaseConnection {
  private connection: mysql.Connection | null = null
  private pool: mysql.Pool | null = null
  private mysqlConfig: MySQLConfig
  private connector: Connector | null = null

  constructor(config: MySQLConfig) {
    super({ ...config, type: 'mysql' })
    this.mysqlConfig = config
  }

  async connect(): Promise<void> {
    // Try Cloud SQL Connector first (for serverless environments)
    const connectionName = process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME
    if (connectionName && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        console.log(`🔗 Attempting Cloud SQL Connector connection to ${connectionName}`)
        await this.connectViaCloudSQLConnector(connectionName)
        return
      } catch (error) {
        console.warn(`⚠️ Cloud SQL Connector failed, falling back to direct connection:`, error instanceof Error ? error.message : String(error))
      }
    }

    // Fallback to direct connection
    try {
      console.log(`🔗 Attempting direct MySQL connection to ${this.config.host}:${this.config.port}`)
      await this.connectDirectly()
    } catch (error) {
      console.error('❌ MySQL connection failed:', error)
      throw new Error(`MySQL connection failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async connectViaCloudSQLConnector(connectionName: string): Promise<void> {
    this.connector = new Connector()
    
    const connectionConfig = {
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      connectionLimit: this.config.maxConnections || 10,
      acquireTimeout: this.config.timeout || 60000,
      timeout: this.config.timeout || 60000,
      timezone: 'Z',
      dateStrings: false,
      multipleStatements: this.mysqlConfig.multipleStatements || false,
      charset: this.mysqlConfig.charset || 'utf8mb4',
      idleTimeout: 300000,
      keepAliveInitialDelay: 0,
      enableKeepAlive: true
    }

    // Get the client connector function
    const clientOpts = await this.connector.getOptions({
      instanceConnectionName: connectionName
      // ipType defaults to 'PUBLIC' - omit for now to avoid TypeScript issues
    })

    // Create pool with connector options
    this.pool = mysql.createPool({
      ...connectionConfig,
      ...clientOpts
    })

    // Test connection
    this.connection = await this.pool.getConnection()
    await this.connection.ping()
    
    this._isConnected = true
    console.log(`✅ MySQL connected via Cloud SQL Connector to ${connectionName}/${this.config.database}`)
    console.log(`🚀 Cloud SQL Connector: Bypassed IP restrictions, using IAM authentication`)
  }

  private async connectDirectly(): Promise<void> {
    const connectionConfig = this.buildConnectionConfig()
    
    // Create connection pool for better performance
    this.pool = mysql.createPool(connectionConfig)
    
    // Test connection
    this.connection = await this.pool.getConnection()
    await this.connection.ping()
    
    this._isConnected = true
    console.log(`✅ MySQL connected directly to ${this.config.host}:${this.config.port}/${this.config.database}`)
  }

  private buildConnectionConfig(): any {
    const config: any = {
      host: this.config.host || 'localhost',
      port: this.config.port || 3306,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      connectionLimit: this.config.maxConnections || 10,
      acquireTimeout: this.config.timeout || 60000,
      timeout: this.config.timeout || 60000,
      timezone: 'Z', // Use UTC
      dateStrings: false,
      multipleStatements: this.mysqlConfig.multipleStatements || false,
      charset: this.mysqlConfig.charset || 'utf8mb4',
      
      // Connection health monitoring
      idleTimeout: 300000, // 5 minutes
      
      // Cloud SQL optimizations
      keepAliveInitialDelay: 0,
      enableKeepAlive: true
    }

    // Configure SSL for Cloud SQL
    if (this.config.ssl) {
      if (typeof this.config.ssl === 'boolean') {
        config.ssl = this.config.ssl
      } else {
        const sslConfig = this.config.ssl
        config.ssl = {
          rejectUnauthorized: sslConfig.rejectUnauthorized !== false, // Default to true for security
        }

        // Load SSL certificates if provided
        if (sslConfig.ca) {
          config.ssl.ca = this.loadCertificate(sslConfig.ca)
        }
        if (sslConfig.cert) {
          config.ssl.cert = this.loadCertificate(sslConfig.cert)
        }
        if (sslConfig.key) {
          config.ssl.key = this.loadCertificate(sslConfig.key)
        }
      }
    }

    return config
  }

  private loadCertificate(certData: string): string | Buffer {
    if (!certData) {
      throw new Error('Certificate data is required but not provided')
    }

    // If it looks like certificate content (starts with -----BEGIN), use directly
    if (certData.includes('-----BEGIN')) {
      return certData
    }

    // If it's a file path (legacy support), try to read it
    if (certData.includes('/') || certData.includes('\\') || certData.endsWith('.pem')) {
      try {
        const fullPath = path.isAbsolute(certData) ? certData : path.join(process.cwd(), certData)
        if (fs.existsSync(fullPath)) {
          console.warn(`⚠️ Loading certificate from file path. Consider using environment variables with certificate content instead.`)
          return fs.readFileSync(fullPath)
        }
      } catch (error) {
        console.warn(`Warning: Could not read certificate file ${certData}:`, error)
      }
    }

    // Return as-is and let the SSL library handle validation
    return certData
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        this.connection.destroy()
        this.connection = null
      }

      if (this.pool) {
        await this.pool.end()
        this.pool = null
      }

      // Close Cloud SQL Connector if it was used
      if (this.connector) {
        await this.connector.close()
        this.connector = null
      }

      this._isConnected = false
      this._inTransaction = false
      console.log('✅ MySQL disconnected')
    } catch (error) {
      console.error('❌ MySQL disconnect error:', error)
      throw error
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    this.validateConnection()

    try {
      if (!this.pool) {
        throw new Error('MySQL pool not initialized')
      }

      const sanitizedParams = this.sanitizeParams(params)
      
      // Execute query using pool
      const [rows, fields] = await this.pool.execute(sql, sanitizedParams) as [any[], mysql.FieldPacket[]]
      
      // Handle different result types
      let affectedRows = 0
      let insertId: string | number | undefined

      if ('affectedRows' in rows) {
        affectedRows = (rows as any).affectedRows
      }
      if ('insertId' in rows) {
        insertId = (rows as any).insertId
      }

      return {
        success: true,
        data: Array.isArray(rows) ? rows as T[] : [],
        affected: affectedRows || (Array.isArray(rows) ? rows.length : 0),
        insertId: insertId,
        metadata: {
          fieldCount: fields?.length || 0,
          fields: fields?.map(f => ({ name: f.name, type: f.type })) || []
        }
      }
    } catch (error) {
      return this.handleError(error, 'query')
    }
  }

  async beginTransaction(): Promise<void> {
    if (this._inTransaction) {
      throw new Error('Transaction already in progress')
    }

    this.validateConnection()
    
    if (!this.pool) {
      throw new Error('MySQL pool not initialized')
    }

    // Get a dedicated connection for the transaction
    this.connection = await this.pool.getConnection()
    await this.connection.beginTransaction()
    this._inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this._inTransaction || !this.connection) {
      throw new Error('No transaction in progress')
    }

    try {
      await this.connection.commit()
    } finally {
      this.connection.destroy()
      this.connection = null
      this._inTransaction = false
    }
  }

  async rollback(): Promise<void> {
    if (!this._inTransaction || !this.connection) {
      throw new Error('No transaction in progress')
    }

    try {
      await this.connection.rollback()
    } finally {
      this.connection.destroy()
      this.connection = null
      this._inTransaction = false
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.pool) return false
      const connection = await this.pool.getConnection()
      await connection.ping()
      connection.destroy()
      return true
    } catch {
      return false
    }
  }

  // MySQL-specific methods
  async createTable(schema: TableSchema): Promise<void> {
    const sql = this.buildCreateTableSQL(schema)
    await this.query(sql)
  }

  async dropTable(tableName: string): Promise<void> {
    await this.query(`DROP TABLE IF EXISTS \`${tableName}\``)
  }

  async showTables(): Promise<string[]> {
    const result = await this.query<{ Tables_in_database: string }>('SHOW TABLES')
    return result.data?.map(row => Object.values(row)[0]) || []
  }

  async describeTable(tableName: string): Promise<any[]> {
    const result = await this.query(`DESCRIBE \`${tableName}\``)
    return result.data || []
  }

  private buildCreateTableSQL(schema: TableSchema): string {
    const columns = schema.columns.map(col => {
      let sql = `\`${col.name}\` ${col.type}`
      
      if (!col.nullable) sql += ' NOT NULL'
      if (col.autoIncrement) sql += ' AUTO_INCREMENT'
      if (col.unique) sql += ' UNIQUE'
      if (col.default !== undefined) {
        sql += ` DEFAULT ${typeof col.default === 'string' ? `'${col.default}'` : col.default}`
      }
      
      return sql
    })

    let sql = `CREATE TABLE \`${schema.name}\` (\n  ${columns.join(',\n  ')}`

    // Add primary key
    if (schema.primaryKey && schema.primaryKey.length > 0) {
      sql += `,\n  PRIMARY KEY (\`${schema.primaryKey.join('`, `')}\`)`
    }

    // Add foreign keys
    if (schema.foreignKeys) {
      for (const fk of schema.foreignKeys) {
        sql += `,\n  FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.referencedTable}\`(\`${fk.referencedColumn}\`)`
        if (fk.onDelete) sql += ` ON DELETE ${fk.onDelete}`
        if (fk.onUpdate) sql += ` ON UPDATE ${fk.onUpdate}`
      }
    }

    sql += '\n)'

    return sql
  }

  // Generic helper methods for database exploration
  
  /**
   * Get sample table schema for reference
   * This is just an example - the system works with any table structure
   */
  static getSampleTableSchema(): TableSchema {
    return {
      name: 'sample_table',
      columns: [
        { name: 'id', type: 'VARCHAR(255)', nullable: false },
        { name: 'name', type: 'VARCHAR(255)', nullable: false },
        { name: 'data', type: 'JSON', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, default: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false, default: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
      ],
      primaryKey: ['id'],
      indexes: [
        { name: 'idx_sample_name', columns: ['name'] },
        { name: 'idx_sample_created', columns: ['created_at'] }
      ]
    }
  }
}