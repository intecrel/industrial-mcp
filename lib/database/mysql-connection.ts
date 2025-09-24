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
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'

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
  private tempCredentialsFile: string | null = null

  constructor(config: MySQLConfig) {
    super({ ...config, type: 'mysql' })
    this.mysqlConfig = config
  }

  async connect(): Promise<void> {
    // Debug environment variables
    const connectionName = process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME
    const credentialsData = process.env.GOOGLE_APPLICATION_CREDENTIALS
    
    console.log(`🔧 Debug: connectionName = "${connectionName}"`)
    console.log(`🔧 Debug: hasCredentials = ${!!credentialsData}`)
    console.log(`🔧 Debug: NODE_ENV = "${process.env.NODE_ENV}"`)
    console.log(`🔧 Debug: VERCEL = "${process.env.VERCEL}"`)
    
    // Try Cloud SQL Connector first (for serverless environments)
    if (connectionName && credentialsData) {
      try {
        console.log(`🔗 Attempting Cloud SQL Connector connection to ${connectionName}`)
        await this.connectViaCloudSQLConnector(connectionName, credentialsData)
        return
      } catch (error) {
        console.warn(`⚠️ Cloud SQL Connector failed, falling back to direct connection:`, error instanceof Error ? error.message : String(error))
      }
    } else {
      console.log(`🔧 Skipping Cloud SQL Connector: connectionName=${!!connectionName}, hasCredentials=${!!credentialsData}`)
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

  private async connectViaCloudSQLConnector(connectionName: string, credentialsData: string): Promise<void> {
    console.log(`🔧 Cloud SQL Connector: Initializing connector for ${connectionName}`)
    
    // Handle credentials - check if it's a file path or JSON content
    let credentialsPath = credentialsData
    
    // If credentials data looks like JSON (starts with {), write it to a temp file
    if (credentialsData.trim().startsWith('{')) {
      try {
        // Validate JSON
        const credentials = JSON.parse(credentialsData)
        console.log(`🔧 Cloud SQL Connector: Using service account ${credentials.client_email} from project ${credentials.project_id}`)
        
        // Write to temporary file
        const tempPath = path.join(tmpdir(), `gcp-credentials-${Date.now()}.json`)
        writeFileSync(tempPath, credentialsData)
        credentialsPath = tempPath
        this.tempCredentialsFile = tempPath
        
        console.log(`🔧 Cloud SQL Connector: Wrote credentials to temporary file`)
      } catch (error) {
        throw new Error(`Invalid GOOGLE_APPLICATION_CREDENTIALS JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      console.log(`🔧 Cloud SQL Connector: Using credentials file path: ${credentialsPath}`)
    }
    
    // Set the credentials file path for the Google Cloud libraries
    const originalGoogleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath
    
    try {
      this.connector = new Connector()
      
      const connectionConfig = {
        user: this.config.username,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: this.config.maxConnections || 10,
        timezone: 'Z',
        dateStrings: false,
        multipleStatements: this.mysqlConfig.multipleStatements || false,
        charset: this.mysqlConfig.charset || 'utf8mb4',
        // Connection timeout settings for table creation operations
        connectTimeout: 120000, // 2 minutes to establish connection
        acquireTimeout: 120000, // 2 minutes to acquire connection from pool
        timeout: 180000, // 3 minutes for query execution (table creation)
        idleTimeout: 300000, // 5 minutes idle timeout
        keepAliveInitialDelay: 0,
        enableKeepAlive: true
      }

      console.log(`🔧 Cloud SQL Connector: Getting connection options for ${connectionName}`)
      // Get the client connector function
      const clientOpts = await this.connector.getOptions({
        instanceConnectionName: connectionName
        // ipType defaults to 'PUBLIC' - omit for now to avoid TypeScript issues
      })
      
      console.log(`🔧 Cloud SQL Connector: Received client options, creating pool`)

      // Create pool with connector options
      this.pool = mysql.createPool({
        ...connectionConfig,
        ...clientOpts
      })

      console.log(`🔧 Cloud SQL Connector: Testing connection...`)
      // Test connection
      this.connection = await this.pool.getConnection()
      await this.connection.ping()
      
      this._isConnected = true
      console.log(`✅ MySQL connected via Cloud SQL Connector to ${connectionName}/${this.config.database}`)
      console.log(`🚀 Cloud SQL Connector: Bypassed IP restrictions, using IAM authentication`)
    } finally {
      // Restore original credentials environment variable
      if (originalGoogleCredentials) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGoogleCredentials
      } else {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS
      }
    }
  }

  private async connectDirectly(): Promise<void> {
    const connectionConfig = this.buildConnectionConfig()
    
    // Create connection pool for better performance
    this.pool = mysql.createPool(connectionConfig)
    
    // Test connection
    this.connection = await this.pool.getConnection()
    await this.connection.ping()
    
    // Security: Verify SSL connection if enabled
    const sslStatus = await this.verifySSLConnection()
    
    this._isConnected = true
    const securityInfo = sslStatus ? '🔒 SSL/TLS Encrypted' : '🔓 Unencrypted'
    console.log(`✅ MySQL connected directly to ${this.maskConnectionString(`${this.config.host}:${this.config.port}`)}/${this.config.database} - ${securityInfo}`)
  }

  private buildConnectionConfig(): any {
    const config: any = {
      host: this.config.host || 'localhost',
      port: this.config.port || 3306,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      connectionLimit: this.config.maxConnections || 10,
      timezone: 'Z', // Use UTC
      dateStrings: false,
      multipleStatements: this.mysqlConfig.multipleStatements || false,
      charset: this.mysqlConfig.charset || 'utf8mb4',

      // Connection timeout settings for table creation operations
      connectTimeout: 120000, // 2 minutes to establish connection
      acquireTimeout: 120000, // 2 minutes to acquire connection from pool
      timeout: 180000, // 3 minutes for query execution (table creation)
      idleTimeout: 300000, // 5 minutes idle timeout

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

      // Clean up temporary credentials file
      if (this.tempCredentialsFile) {
        try {
          unlinkSync(this.tempCredentialsFile)
          console.log('🔧 Cleaned up temporary credentials file')
        } catch (error) {
          console.warn('⚠️ Failed to clean up temporary credentials file:', error)
        }
        this.tempCredentialsFile = null
      }

      this._isConnected = false
      this._inTransaction = false
      console.log('✅ MySQL disconnected')
    } catch (error) {
      console.error('❌ MySQL disconnect error:', error)
      throw error
    }
  }

  async query<T = any>(sql: string, params?: any[] | Record<string, any>): Promise<QueryResult<T>> {
    this.validateConnection()

    try {
      if (!this.pool) {
        throw new Error('MySQL pool not initialized')
      }

      let sanitizedParams: any[] = []
      if (Array.isArray(params)) {
        sanitizedParams = this.sanitizeParams(params)
      } else if (params && typeof params === 'object') {
        // Convert object to array of values (order by key name)
        sanitizedParams = this.sanitizeParams(Object.values(params))
      }

      // Execute query using pool
      const [rows, fields] = sanitizedParams.length > 0 
        ? await this.pool.execute(sql, sanitizedParams) as [any[], mysql.FieldPacket[]]
        : await this.pool.query(sql) as [any[], mysql.FieldPacket[]]
      
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

  // Security methods
  private sanitizeQuery(sql: string): string {
    if (!sql || typeof sql !== 'string') {
      throw new Error('SQL query must be a non-empty string')
    }

    // Remove potential injection patterns
    const sanitized = sql
      .replace(/\\x[0-9a-fA-F]{2}/g, '') // Remove hex escapes
      .replace(/\\[0-7]{1,3}/g, '')      // Remove octal escapes  
      .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove block comments
      .replace(/--[^\r\n]*/g, '')       // Remove line comments
      .trim()

    if (!sanitized) {
      throw new Error('SQL query cannot be empty after sanitization')
    }

    return sanitized
  }

  private validateQuerySecurity(sql: string): void {
    const upperSql = sql.toUpperCase().trim()

    // Exception: Allow CREATE TABLE for audit system tables
    const auditTablePatterns = [
      /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+audit_events\b/,
      /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+database_audit_events\b/,
      /\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+audit_retention_policy\b/
    ]

    const isAuditTableCreation = auditTablePatterns.some(pattern => {
      const match = pattern.test(upperSql)
      if (match) {
        console.log('✅ Pattern matched:', pattern.source)
      }
      return match
    })

    if (isAuditTableCreation) {
      console.log('✅ Allowing audit table creation:', sql.substring(0, 100) + '...')
      return // Allow audit table creation
    }

    // Debug: Log first part of non-matching SQL for troubleshooting
    if (upperSql.startsWith('CREATE TABLE')) {
      console.log('🔍 CREATE TABLE detected but no audit pattern match:', sql.substring(0, 100) + '...')
    }

    // Security: Block dangerous operations for MCP endpoints
    const dangerousPatterns = [
      /\bDROP\s+/,
      /\bDELETE\s+FROM\s+/,
      /\bTRUNCATE\s+/,
      /\bALTER\s+/,
      /\bCREATE\s+(?:TABLE|INDEX|VIEW|PROCEDURE|FUNCTION)\s+/,
      /\bGRANT\s+/,
      /\bREVOKE\s+/,
      /\bLOAD_FILE\s*\(/,
      /\bINTO\s+OUTFILE\s+/,
      /\bINTO\s+DUMPFILE\s+/
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(upperSql)) {
        throw new Error(`Security: SQL query contains potentially dangerous operation: ${pattern.source}`)
      }
    }

    // Allow common read operations and controlled write operations
    const allowedOperations = [
      /^\s*SELECT\s+/,
      /^\s*SHOW\s+/,
      /^\s*DESCRIBE\s+/,
      /^\s*EXPLAIN\s+/,
      /^\s*INSERT\s+INTO\s+/,
      /^\s*UPDATE\s+.*\s+SET\s+/,
      /^\s*REPLACE\s+INTO\s+/
    ]

    const hasAllowedOperation = allowedOperations.some(pattern => pattern.test(upperSql))
    if (!hasAllowedOperation && upperSql.length > 0) {
      console.warn(`⚠️ Security warning: SQL query may contain unsupported operations: ${sql.substring(0, 100)}...`)
    }
  }

  private async verifySSLConnection(): Promise<boolean> {
    try {
      if (!this.connection) return false
      
      const [rows] = await this.connection.execute('SHOW STATUS LIKE "Ssl_cipher"') as [any[], any]
      const sslCipher = rows.find((row: any) => row.Variable_name === 'Ssl_cipher')
      
      if (sslCipher && sslCipher.Value) {
        console.log(`🔒 MySQL SSL connection verified: ${sslCipher.Value}`)
        return true
      }
      
      return false
    } catch (error) {
      console.warn('⚠️ Could not verify SSL status:', error)
      return false
    }
  }

  private maskConnectionString(hostPort: string): string {
    // Security: Mask sensitive information in logs
    return hostPort.replace(/:\d+$/, ':***')
  }
}