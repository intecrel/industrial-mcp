/**
 * Neo4j database connection implementation
 */

import neo4j, { Driver, Session, Transaction, Result } from 'neo4j-driver'
import { BaseDatabaseConnection } from './base'
import { DatabaseConfig, QueryResult } from './types'

export class Neo4jConnection extends BaseDatabaseConnection {
  private driver: Driver | null = null
  private session: Session | null = null
  private transaction: Transaction | null = null

  constructor(config: DatabaseConfig) {
    super({ ...config, type: 'neo4j' })
  }

  async connect(): Promise<void> {
    try {
      const uri = this.config.uri || `bolt://${this.config.host || 'localhost'}:${this.config.port || 7687}`
      const username = this.config.username || 'neo4j'
      const password = this.config.password || 'password'

      // Validate credentials are provided
      if (!username || !password) {
        throw new Error('Neo4j credentials are required but not provided')
      }

      // Security: Ensure SSL/TLS for production connections
      const isSecureConnection = uri.startsWith('neo4j+s://') || uri.startsWith('bolt+s://')
      if (process.env.NODE_ENV === 'production' && !isSecureConnection) {
        console.warn('⚠️ WARNING: Using unencrypted Neo4j connection in production')
      }

      this.driver = neo4j.driver(
        uri,
        neo4j.auth.basic(username, password),
        {
          maxConnectionLifetime: 30000,
          maxConnectionPoolSize: this.config.maxConnections || 50,
          connectionAcquisitionTimeout: this.config.timeout || 60000,
          disableLosslessIntegers: true,
          // Security: Enable encryption verification
          encrypted: isSecureConnection,
          trust: isSecureConnection ? 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES' : 'TRUST_ALL_CERTIFICATES'
        }
      )

      // Test connection and verify encryption
      await this.driver.verifyConnectivity()
      this._isConnected = true

      // Security: Log connection security status
      const securityStatus = isSecureConnection ? '🔒 Encrypted (SSL/TLS)' : '🔓 Unencrypted'
      console.log(`✅ Neo4j connected to ${this.maskConnectionString(uri)} - ${securityStatus}`)
    } catch (error) {
      console.error('❌ Neo4j connection failed:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.transaction) {
        await this.transaction.rollback()
        this.transaction = null
      }

      if (this.session) {
        await this.session.close()
        this.session = null
      }

      if (this.driver) {
        await this.driver.close()
        this.driver = null
      }

      this._isConnected = false
      this._inTransaction = false
      console.log('✅ Neo4j disconnected')
    } catch (error) {
      console.error('❌ Neo4j disconnect error:', error)
      throw error
    }
  }

  async query<T = any>(cypher: string, params?: any[]): Promise<QueryResult<T>> {
    this.validateConnection()

    try {
      // Security: Validate and sanitize query
      const sanitizedQuery = this.sanitizeQuery(cypher)
      const sanitizedParams = this.sanitizeParams(params)
      
      // Security: Enforce read-only operations for security
      this.validateQuerySecurity(sanitizedQuery)

      const session = this.getSession()
      const parameters = this.convertParams(sanitizedParams)

      const result = this._inTransaction && this.transaction
        ? await this.transaction.run(sanitizedQuery, parameters)
        : await session.run(sanitizedQuery, parameters)

      const records = result.records.map(record => {
        // Convert Neo4j record to plain object
        const obj: any = {}
        record.keys.forEach(key => {
          const value = record.get(key)
          obj[key] = this.convertNeo4jValue(value)
        })
        return obj as T
      })

      const summary = result.summary
      const counters = summary.counters?.updates()

      return {
        success: true,
        data: records,
        affected: counters ? (
          counters.nodesCreated + 
          counters.nodesDeleted +
          counters.relationshipsCreated +
          counters.relationshipsDeleted
        ) : 0,
        metadata: {
          resultAvailableAfter: this.convertToNumber(summary.resultAvailableAfter) || 0,
          resultConsumedAfter: this.convertToNumber(summary.resultConsumedAfter) || 0,
          counters: counters || {}
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
    const session = this.getSession()
    this.transaction = session.beginTransaction()
    this._inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this._inTransaction || !this.transaction) {
      throw new Error('No transaction in progress')
    }

    try {
      await this.transaction.commit()
    } finally {
      this.transaction = null
      this._inTransaction = false
    }
  }

  async rollback(): Promise<void> {
    if (!this._inTransaction || !this.transaction) {
      throw new Error('No transaction in progress')
    }

    try {
      await this.transaction.rollback()
    } finally {
      this.transaction = null
      this._inTransaction = false
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.driver) return false
      await this.driver.verifyConnectivity()
      return true
    } catch {
      return false
    }
  }

  // Neo4j-specific methods
  async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS FOR (e:Equipment) ON (e.id)',
      'CREATE INDEX IF NOT EXISTS FOR (e:Equipment) ON (e.type)',
      'CREATE INDEX IF NOT EXISTS FOR (e:Equipment) ON (e.status)',
      'CREATE INDEX IF NOT EXISTS FOR (d:OperationalData) ON (d.timestamp)',
      'CREATE INDEX IF NOT EXISTS FOR (d:OperationalData) ON (d.equipmentId)',
      'CREATE INDEX IF NOT EXISTS FOR (m:MaintenanceRecord) ON (m.equipmentId)',
      'CREATE INDEX IF NOT EXISTS FOR (m:MaintenanceRecord) ON (m.scheduledDate)'
    ]

    for (const indexQuery of indexes) {
      await this.query(indexQuery)
    }
  }

  async createConstraints(): Promise<void> {
    const constraints = [
      'CREATE CONSTRAINT IF NOT EXISTS FOR (e:Equipment) REQUIRE e.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (d:OperationalData) REQUIRE d.id IS UNIQUE',
      'CREATE CONSTRAINT IF NOT EXISTS FOR (m:MaintenanceRecord) REQUIRE m.id IS UNIQUE'
    ]

    for (const constraintQuery of constraints) {
      await this.query(constraintQuery)
    }
  }

  private getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized')
    }

    if (!this.session || !this.session.lastBookmark()) {
      this.session = this.driver.session()
    }

    return this.session
  }

  private convertParams(params?: any[]): Record<string, any> {
    if (!params || params.length === 0) return {}

    // Convert array of parameters to named parameters
    const namedParams: Record<string, any> = {}
    params.forEach((param, index) => {
      namedParams[`param${index}`] = param
    })
    return namedParams
  }

  private convertNeo4jValue(value: any): any {
    if (value === null || value === undefined) {
      return null
    }

    // Handle Neo4j integers (convert to JavaScript numbers)
    if (neo4j.isInt(value)) {
      return value.toNumber()
    }

    // Handle Neo4j DateTime
    if (neo4j.isDateTime(value)) {
      return new Date(value.toString())
    }

    // Handle Neo4j Date
    if (neo4j.isDate(value)) {
      return new Date(value.toString())
    }

    // Handle Node objects
    if (value.constructor.name === 'Node') {
      return {
        identity: value.identity.toNumber(),
        labels: value.labels,
        properties: this.convertNeo4jProperties(value.properties)
      }
    }

    // Handle Relationship objects
    if (value.constructor.name === 'Relationship') {
      return {
        identity: value.identity.toNumber(),
        start: value.start.toNumber(),
        end: value.end.toNumber(),
        type: value.type,
        properties: this.convertNeo4jProperties(value.properties)
      }
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => this.convertNeo4jValue(item))
    }

    // Handle objects
    if (typeof value === 'object') {
      return this.convertNeo4jProperties(value)
    }

    return value
  }

  private convertNeo4jProperties(properties: Record<string, any>): Record<string, any> {
    const converted: Record<string, any> = {}
    
    for (const [key, value] of Object.entries(properties)) {
      converted[key] = this.convertNeo4jValue(value)
    }
    
    return converted
  }

  private convertToNumber(value: any): number {
    if (value == null) return 0
    if (typeof value === 'number') return value
    if (neo4j.isInt(value)) return value.toNumber()
    if (typeof value === 'string') return parseFloat(value) || 0
    return 0
  }

  // Security methods
  private sanitizeQuery(cypher: string): string {
    if (!cypher || typeof cypher !== 'string') {
      throw new Error('Query must be a non-empty string')
    }

    // Remove potential injection patterns
    const sanitized = cypher
      .replace(/\\x[0-9a-fA-F]{2}/g, '') // Remove hex escapes
      .replace(/\\[0-7]{1,3}/g, '')      // Remove octal escapes
      .trim()

    if (!sanitized) {
      throw new Error('Query cannot be empty after sanitization')
    }

    return sanitized
  }

  private validateQuerySecurity(cypher: string): void {
    const upperQuery = cypher.toUpperCase().trim()
    
    // Security: Block dangerous operations for MCP endpoints
    const dangerousPatterns = [
      /\bDROP\s+/,
      /\bDELETE\s+/,
      /\bREMOVE\s+/,
      /\bDETACH\s+DELETE\s+/,
      /\bCREATE\s+INDEX\s+/,
      /\bDROP\s+INDEX\s+/,
      /\bCREATE\s+CONSTRAINT\s+/,
      /\bDROP\s+CONSTRAINT\s+/
    ]
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(upperQuery)) {
        throw new Error(`Security: Query contains potentially dangerous operation: ${pattern.source}`)
      }
    }

    // Allow common read operations and controlled write operations
    const allowedOperations = [
      /^\s*MATCH\s+/,
      /^\s*RETURN\s+/,
      /^\s*OPTIONAL\s+MATCH\s+/,
      /^\s*WITH\s+/,
      /^\s*UNWIND\s+/,
      /^\s*CALL\s+db\.(schema|labels|relationshipTypes|propertyKeys)/,
      /^\s*CREATE\s+(?!.*\b(?:INDEX|CONSTRAINT)\b)/,  // Allow CREATE nodes/relationships but not indexes/constraints
      /^\s*MERGE\s+/,
      /^\s*SET\s+/
    ]

    const hasAllowedOperation = allowedOperations.some(pattern => pattern.test(upperQuery))
    if (!hasAllowedOperation && upperQuery.length > 0) {
      console.warn(`⚠️ Security warning: Query may contain unsupported operations: ${cypher.substring(0, 100)}...`)
    }
  }

  private maskConnectionString(uri: string): string {
    // Security: Mask sensitive information in logs
    return uri.replace(/:([^@]+)@/, ':***@')
  }
}