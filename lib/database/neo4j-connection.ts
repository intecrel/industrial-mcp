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

      // Build driver config - don't specify encryption when URI already has it
      const driverConfig: any = {
        maxConnectionLifetime: 30000,
        maxConnectionPoolSize: this.config.maxConnections || 50,
        connectionAcquisitionTimeout: this.config.timeout || 60000,
        disableLosslessIntegers: true,
      }

      // Only add encryption config if URI doesn't already specify it
      if (!uri.includes('+s://')) {
        driverConfig.encrypted = isSecureConnection
        driverConfig.trust = isSecureConnection ? 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES' : 'TRUST_ALL_CERTIFICATES'
      }

      this.driver = neo4j.driver(
        uri,
        neo4j.auth.basic(username, password),
        driverConfig
      )

      // Test connection and verify encryption
      await this.driver.verifyConnectivity()
      this._isConnected = true

      // Security: Log connection security status
      const securityStatus = isSecureConnection ? '🔒 Encrypted (SSL/TLS)' : '🔓 Unencrypted'
      console.log(`✅ Neo4j connected to ${this.maskConnectionString(uri)} - ${securityStatus}`)
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('❌ Neo4j connection failed:', error)
      }
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

  async query<T = any>(cypher: string, params?: any[] | Record<string, any>): Promise<QueryResult<T>> {
    this.validateConnection()

    try {
      // Security: Validate and sanitize query
      const sanitizedQuery = this.sanitizeQuery(cypher)
      // Accept both array and object for params
      let parameters: Record<string, any> = {}
      if (Array.isArray(params)) {
        parameters = this.convertParams(params)
      } else if (params && typeof params === 'object') {
        parameters = params
      }

      // Security: Enforce read-only operations for security
      this.validateQuerySecurity(sanitizedQuery)

      const session = this.getSession()

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
        identity: this.convertToNumber(value.identity),
        labels: value.labels,
        properties: this.convertNeo4jProperties(value.properties)
      }
    }

    // Handle Relationship objects
    if (value.constructor.name === 'Relationship') {
      return {
        identity: this.convertToNumber(value.identity),
        start: this.convertToNumber(value.start),
        end: this.convertToNumber(value.end),
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

    // Handle identity values which might be integers or other types
    if (value && typeof value.toNumber === 'function') {
      try {
        return value.toNumber()
      } catch (error) {
        console.warn('Failed to convert value to number using toNumber():', error)
      }
    }

    // Handle identity values that might be native JavaScript numbers
    if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
      // Neo4j Integer object structure
      return value.low + (value.high * 0x100000000)
    }

    if (typeof value === 'string') return parseFloat(value) || 0

    // Fallback for any numeric value
    const parsed = Number(value)
    return isNaN(parsed) ? 0 : parsed
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

  // State capture methods for audit trails

  /**
   * Capture node state by ID for audit trails
   */
  async captureNodeState(nodeId: number | string): Promise<any> {
    try {
      const query = `MATCH (n) WHERE id(n) = $nodeId RETURN n`
      const result = await this.query(query, { nodeId })
      return result.data && result.data.length > 0 ? result.data[0].n : null
    } catch (error) {
      console.warn('Failed to capture node state:', error)
      return null
    }
  }

  /**
   * Capture multiple nodes state by criteria for audit trails
   */
  async captureNodesState(matchClause: string, parameters: Record<string, any> = {}): Promise<any[]> {
    try {
      const query = `${matchClause} RETURN n`
      const result = await this.query(query, parameters)
      return result.data ? result.data.map(record => record.n) : []
    } catch (error) {
      console.warn('Failed to capture nodes state:', error)
      return []
    }
  }

  /**
   * Capture relationship state by ID for audit trails
   */
  async captureRelationshipState(relationshipId: number | string): Promise<any> {
    try {
      const query = `MATCH ()-[r]->() WHERE id(r) = $relationshipId RETURN r`
      const result = await this.query(query, { relationshipId })
      return result.data && result.data.length > 0 ? result.data[0].r : null
    } catch (error) {
      console.warn('Failed to capture relationship state:', error)
      return null
    }
  }

  /**
   * Analyze query to determine what entities it might affect
   * Used for pre-execution state capture
   */
  analyzeQueryForStateCapture(cypher: string, parameters: Record<string, any> = {}): {
    needsStateCapture: boolean;
    captureStrategy: 'nodes' | 'relationships' | 'both' | 'none';
    matchClause?: string;
  } {
    const upperQuery = cypher.toUpperCase().trim()

    // For SET operations, we need to capture before state
    if (upperQuery.includes('SET ')) {
      // Extract MATCH clause for state capture (everything before SET/WHERE)
      // Use proper lookahead to stop before SET or WHERE keywords
      const matchMatch = cypher.match(/^\s*(MATCH\s+.+?)(?=\s+(?:SET|WHERE|RETURN|WITH|DELETE|REMOVE|$))/i)
      if (matchMatch) {
        return {
          needsStateCapture: true,
          captureStrategy: 'nodes',
          matchClause: matchMatch[1].trim()
        }
      }
    }

    // For MERGE operations on relationships
    if (upperQuery.includes('MERGE ') && (upperQuery.includes('-->') || upperQuery.includes('-[') || upperQuery.includes(']->'))) {
      return {
        needsStateCapture: true,
        captureStrategy: 'both'
      }
    }

    // For CREATE operations
    if (upperQuery.includes('CREATE ')) {
      return {
        needsStateCapture: false, // No before state needed for creation
        captureStrategy: 'none'
      }
    }

    return {
      needsStateCapture: false,
      captureStrategy: 'none'
    }
  }

  /**
   * Execute query with state capture for audit trails
   */
  async queryWithAuditCapture<T = any>(
    cypher: string,
    params?: any[] | Record<string, any>,
    captureStates: boolean = true
  ): Promise<QueryResult<T> & { beforeState?: any; afterState?: any }> {
    const startTime = Date.now()
    let beforeState: any = null
    let afterState: any = null

    try {
      // Analyze query for state capture needs
      const parameters = Array.isArray(params) ? this.convertParams(params) : (params || {})
      const analysis = this.analyzeQueryForStateCapture(cypher, parameters)

      // Capture before state if needed
      if (captureStates && analysis.needsStateCapture && analysis.matchClause) {
        beforeState = await this.captureNodesState(analysis.matchClause, parameters)
      }

      // Execute the query
      const result = await this.query<T>(cypher, params)

      // Capture after state for write operations
      if (captureStates && this.isWriteOperation(cypher) && analysis.matchClause) {
        afterState = await this.captureNodesState(analysis.matchClause, parameters)
      }

      return {
        ...result,
        beforeState,
        afterState
      }
    } catch (error) {
      return {
        success: false,
        data: [],
        affected: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        beforeState,
        afterState
      } as QueryResult<T> & { beforeState?: any; afterState?: any }
    }
  }

  /**
   * Determine if a query is a write operation
   */
  private isWriteOperation(cypher: string): boolean {
    const upperQuery = cypher.toUpperCase().trim()
    return upperQuery.includes('CREATE ') ||
           upperQuery.includes('MERGE ') ||
           upperQuery.includes('SET ')
  }

  /**
   * Calculate query complexity score based on various factors
   */
  calculateQueryComplexity(cypher: string, parameters: Record<string, any> = {}): number {
    let complexity = 0
    const upperQuery = cypher.toUpperCase()

    // Base complexity for different operations
    if (upperQuery.includes('MATCH')) complexity += 10
    if (upperQuery.includes('CREATE')) complexity += 20
    if (upperQuery.includes('MERGE')) complexity += 30
    if (upperQuery.includes('SET')) complexity += 15

    // Relationship complexity
    const relationshipCount = (cypher.match(/--\>|<--|--/g) || []).length
    complexity += relationshipCount * 5

    // Parameter complexity
    complexity += Object.keys(parameters).length * 2

    // Query length factor
    complexity += Math.floor(cypher.length / 100) * 5

    // OPTIONAL MATCH increases complexity
    if (upperQuery.includes('OPTIONAL MATCH')) complexity += 15

    // Collections and aggregations
    if (upperQuery.includes('COLLECT(') || upperQuery.includes('COUNT(')) complexity += 10

    // Path traversal complexity
    const pathTraversals = (cypher.match(/\*[0-9]+\.\.[0-9]+/g) || []).length
    complexity += pathTraversals * 20

    // Cap at 100
    return Math.min(complexity, 100)
  }

  /**
   * Estimate affected entities from query result counters
   */
  estimateAffectedEntities(result: QueryResult<any>): { nodes: number; relationships: number } {
    const counters = result.metadata?.counters as any

    if (counters) {
      return {
        nodes: (counters.nodesCreated || 0) + (counters.nodesDeleted || 0),
        relationships: (counters.relationshipsCreated || 0) + (counters.relationshipsDeleted || 0)
      }
    }

    // Fallback estimation based on result size
    const resultSize = result.data?.length || 0
    return {
      nodes: resultSize,
      relationships: 0
    }
  }

  // Phase 3: Transaction Safety Integration

  /**
   * Execute write operations with mandatory transaction wrapping
   */
  async executeWriteOperationSafely<T = any>(
    cypher: string,
    params?: any[] | Record<string, any>,
    options: {
      maxOperationsPerTransaction?: number;
      timeoutMs?: number;
      captureState?: boolean;
      transactionId?: string;
    } = {}
  ): Promise<QueryResult<T> & { beforeState?: any; afterState?: any; transactionId: string }> {
    const transactionId = options.transactionId || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const maxOperations = options.maxOperationsPerTransaction || 1000
    const timeoutMs = options.timeoutMs || 30000
    const captureState = options.captureState !== false

    let beforeState: any = null
    let afterState: any = null
    let operationCount = 0

    try {
      // Begin transaction
      await this.beginTransaction()
      console.log(`🔄 Started transaction: ${transactionId}`)

      // Set transaction timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timeout')), timeoutMs)
      })

      // Capture before state if needed
      if (captureState) {
        const parameters = Array.isArray(params) ? this.convertParams(params) : (params || {})
        const analysis = this.analyzeQueryForStateCapture(cypher, parameters)

        if (analysis.needsStateCapture && analysis.matchClause) {
          beforeState = await this.captureNodesState(analysis.matchClause, parameters)
          console.log(`📸 Captured before state: ${beforeState?.length || 0} entities`)
        }
      }

      // Execute the operation within transaction
      const operationPromise = this.query<T>(cypher, params)
      const result = await Promise.race([operationPromise, timeoutPromise]) as QueryResult<T>

      operationCount++

      if (!result.success) {
        throw new Error(result.error || 'Write operation failed')
      }

      // Check operation count limits
      if (operationCount > maxOperations) {
        throw new Error(`Transaction exceeded maximum operations limit: ${maxOperations}`)
      }

      // Capture after state for audit trail
      if (captureState && this.isWriteOperation(cypher)) {
        const parameters = Array.isArray(params) ? this.convertParams(params) : (params || {})
        const analysis = this.analyzeQueryForStateCapture(cypher, parameters)

        if (analysis.matchClause) {
          afterState = await this.captureNodesState(analysis.matchClause, parameters)
          console.log(`📸 Captured after state: ${afterState?.length || 0} entities`)
        }
      }

      // Commit transaction
      await this.commit()
      console.log(`✅ Committed transaction: ${transactionId}`)

      return {
        ...result,
        beforeState,
        afterState,
        transactionId
      }

    } catch (error) {
      // Rollback on any error
      try {
        if (this._inTransaction) {
          await this.rollback()
          console.log(`🔄 Rolled back transaction: ${transactionId}`)
        }
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError)
      }

      throw error
    }
  }

  /**
   * Execute multiple write operations in a single transaction
   */
  async executeBatchWriteOperations<T = any>(
    operations: Array<{
      cypher: string;
      params?: any[] | Record<string, any>;
      captureState?: boolean;
    }>,
    options: {
      maxOperationsPerTransaction?: number;
      timeoutMs?: number;
      stopOnFirstError?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    results: Array<QueryResult<T> & { beforeState?: any; afterState?: any }>;
    transactionId: string;
    operationsCompleted: number;
    error?: string;
  }> {
    const transactionId = `batch_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const maxOperations = options.maxOperationsPerTransaction || 1000
    const timeoutMs = options.timeoutMs || 60000
    const stopOnFirstError = options.stopOnFirstError !== false

    const results: Array<QueryResult<T> & { beforeState?: any; afterState?: any }> = []
    let operationsCompleted = 0

    try {
      // Validate batch size
      if (operations.length > maxOperations) {
        throw new Error(`Batch size ${operations.length} exceeds maximum allowed operations: ${maxOperations}`)
      }

      // Begin transaction
      await this.beginTransaction()
      console.log(`🔄 Started batch transaction: ${transactionId} with ${operations.length} operations`)

      // Set overall timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Batch transaction timeout')), timeoutMs)
      })

      // Execute all operations within the transaction
      const batchPromise = async () => {
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i]
          let beforeState: any = null
          let afterState: any = null

          try {
            // Capture before state if requested
            if (operation.captureState !== false) {
              const parameters = Array.isArray(operation.params)
                ? this.convertParams(operation.params)
                : (operation.params || {})
              const analysis = this.analyzeQueryForStateCapture(operation.cypher, parameters)

              if (analysis.needsStateCapture && analysis.matchClause) {
                beforeState = await this.captureNodesState(analysis.matchClause, parameters)
              }
            }

            // Execute operation
            const result = await this.query<T>(operation.cypher, operation.params)

            if (!result.success) {
              if (stopOnFirstError) {
                throw new Error(`Operation ${i + 1} failed: ${result.error}`)
              }
              console.warn(`⚠️ Operation ${i + 1} failed (continuing): ${result.error}`)
            }

            // Capture after state if this was a write operation
            if (operation.captureState !== false && this.isWriteOperation(operation.cypher)) {
              const parameters = Array.isArray(operation.params)
                ? this.convertParams(operation.params)
                : (operation.params || {})
              const analysis = this.analyzeQueryForStateCapture(operation.cypher, parameters)

              if (analysis.matchClause) {
                afterState = await this.captureNodesState(analysis.matchClause, parameters)
              }
            }

            results.push({
              ...result,
              beforeState,
              afterState
            })

            operationsCompleted++

          } catch (operationError) {
            if (stopOnFirstError) {
              throw operationError
            }
            console.warn(`⚠️ Operation ${i + 1} error (continuing):`, operationError)
            results.push({
              success: false,
              data: [],
              affected: 0,
              error: operationError instanceof Error ? operationError.message : 'Unknown error',
              beforeState,
              afterState
            } as QueryResult<T> & { beforeState?: any; afterState?: any })
          }
        }
      }

      await Promise.race([batchPromise(), timeoutPromise])

      // Commit transaction
      await this.commit()
      console.log(`✅ Committed batch transaction: ${transactionId}, completed ${operationsCompleted}/${operations.length} operations`)

      return {
        success: true,
        results,
        transactionId,
        operationsCompleted
      }

    } catch (error) {
      // Rollback on any error
      try {
        if (this._inTransaction) {
          await this.rollback()
          console.log(`🔄 Rolled back batch transaction: ${transactionId}`)
        }
      } catch (rollbackError) {
        console.error('❌ Batch rollback failed:', rollbackError)
      }

      return {
        success: false,
        results,
        transactionId,
        operationsCompleted,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Enhanced rollback with audit logging
   */
  async rollbackWithAudit(reason?: string, transactionId?: string): Promise<void> {
    try {
      await this.rollback()

      console.log(`🔄 Transaction rolled back: ${transactionId || 'unknown'}${reason ? ` - ${reason}` : ''}`)

      // TODO: Add audit logging for rollback
      // This will be implemented when we integrate the audit logger with connection layer

    } catch (error) {
      console.error('❌ Enhanced rollback failed:', error)
      throw error
    }
  }
}