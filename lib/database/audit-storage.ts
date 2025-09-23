/**
 * Configurable Audit Trail Storage System
 * Supports multiple storage backends with performance controls
 */

import { getGlobalDatabaseManager } from './index'
import type { AuditEvent, DatabaseAuditEvent } from '../security/audit-logger'

// Storage configuration
export interface AuditStorageConfig {
  enabled: boolean
  storageType: 'console' | 'database' | 'hybrid'
  batchSize: number
  flushIntervalMs: number
  retentionDays: number
  enableStateCapture: boolean
  maxStateSizeKB: number
  compressionEnabled: boolean
}

// Default configuration - optimized for performance
export const DEFAULT_AUDIT_CONFIG: AuditStorageConfig = {
  enabled: process.env.AUDIT_STORAGE_ENABLED === 'true',
  storageType: (process.env.AUDIT_STORAGE_TYPE as any) || 'hybrid',
  batchSize: parseInt(process.env.AUDIT_BATCH_SIZE || '50'),
  flushIntervalMs: parseInt(process.env.AUDIT_FLUSH_INTERVAL_MS || '30000'), // 30 seconds
  retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '2555'), // 7 years
  enableStateCapture: process.env.AUDIT_ENABLE_STATE_CAPTURE !== 'false',
  maxStateSizeKB: parseInt(process.env.AUDIT_MAX_STATE_SIZE_KB || '1024'), // 1MB
  compressionEnabled: process.env.AUDIT_COMPRESSION_ENABLED === 'true'
}

// Audit event storage interface
export interface StoredAuditEvent extends AuditEvent {
  id?: number
  created_at?: Date
  updated_at?: Date
  state_size_bytes?: number
  compressed?: boolean
}

// Batch storage for performance
interface AuditBatch {
  events: StoredAuditEvent[]
  size: number
  createdAt: number
}

// In-memory batch storage
let auditBatch: AuditBatch = {
  events: [],
  size: 0,
  createdAt: Date.now()
}

// Flush timer
let flushTimer: NodeJS.Timeout | null = null

/**
 * Database schema creation SQL
 */
export const AUDIT_SCHEMA_SQL = `
-- Audit Events Table
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  timestamp DATETIME(6) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  user_id VARCHAR(255),
  user_email VARCHAR(255),
  client_id VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(100),
  resource VARCHAR(255),
  action TEXT NOT NULL,
  result ENUM('success', 'failure', 'warning') NOT NULL,
  risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexing strategy for performance
  INDEX idx_timestamp (timestamp),
  INDEX idx_event_type (event_type),
  INDEX idx_user_id (user_id),
  INDEX idx_user_email (user_email),
  INDEX idx_session_id (session_id),
  INDEX idx_risk_level (risk_level),
  INDEX idx_result (result),
  INDEX idx_created_at (created_at),
  INDEX idx_composite_user_time (user_id, timestamp),
  INDEX idx_composite_type_time (event_type, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Database-specific Audit Events Table
CREATE TABLE IF NOT EXISTS database_audit_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  audit_event_id BIGINT NOT NULL,
  database_type ENUM('neo4j', 'mysql') NOT NULL,
  operation_type ENUM('CREATE', 'MERGE', 'SET', 'READ') NOT NULL,
  query_hash VARCHAR(64) NOT NULL,
  affected_nodes INT DEFAULT 0,
  affected_relationships INT DEFAULT 0,
  execution_time_ms INT NOT NULL,
  complexity_score INT DEFAULT 0,
  transaction_id VARCHAR(100),
  query_parameters JSON,
  before_state JSON,
  after_state JSON,
  state_size_bytes INT DEFAULT 0,
  compressed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key relationship
  FOREIGN KEY (audit_event_id) REFERENCES audit_events(id) ON DELETE CASCADE,

  -- Performance indexes
  INDEX idx_audit_event_id (audit_event_id),
  INDEX idx_database_type (database_type),
  INDEX idx_operation_type (operation_type),
  INDEX idx_query_hash (query_hash),
  INDEX idx_transaction_id (transaction_id),
  INDEX idx_execution_time (execution_time_ms),
  INDEX idx_complexity (complexity_score),
  INDEX idx_composite_db_op (database_type, operation_type),
  INDEX idx_composite_db_time (database_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit Event Retention Policy Table
CREATE TABLE IF NOT EXISTS audit_retention_policy (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_type VARCHAR(100) NOT NULL,
  retention_days INT NOT NULL,
  archive_after_days INT,
  delete_after_days INT,
  compress_after_days INT DEFAULT 90,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default retention policies
INSERT IGNORE INTO audit_retention_policy (event_type, retention_days, archive_after_days, delete_after_days, compress_after_days) VALUES
  ('database.neo4j.%', 2555, 365, 2555, 90),  -- 7 years for database operations
  ('security.%', 2190, 365, 2190, 30),        -- 6 years for security events
  ('oauth.%', 1095, 180, 1095, 60),           -- 3 years for OAuth events
  ('auth.%', 730, 90, 730, 30),               -- 2 years for auth events
  ('system.%', 365, 90, 365, 30),             -- 1 year for system events
  ('default', 365, 90, 365, 30);              -- Default 1 year
`;

/**
 * Audit Storage Manager
 */
export class AuditStorageManager {
  private config: AuditStorageConfig
  private isInitialized = false

  constructor(config: AuditStorageConfig = DEFAULT_AUDIT_CONFIG) {
    this.config = config
  }

  /**
   * Initialize audit storage system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log(`⚠️ Audit storage already initialized, skipping initialization`)
      return
    }

    console.log(`🗄️ Initializing audit storage: ${this.config.storageType} mode`)

    if (this.config.storageType === 'database' || this.config.storageType === 'hybrid') {
      console.log('🔄 About to call initializeDatabase()...')
      try {
        await this.initializeDatabase()
        console.log('✅ initializeDatabase() completed successfully')
      } catch (error) {
        console.error('❌ initializeDatabase() threw an error:', error)
        throw error
      }
    }

    // Set up batch flushing if using database storage
    if (this.config.storageType === 'database' || this.config.storageType === 'hybrid') {
      this.startBatchFlushing()
    }

    this.isInitialized = true
    console.log(`✅ Audit storage initialized: batch=${this.config.batchSize}, retention=${this.config.retentionDays}d`)
  }

  /**
   * Store audit event with configurable storage
   */
  async storeAuditEvent(event: AuditEvent): Promise<void> {
    if (!this.config.enabled) {
      return // Audit storage disabled
    }

    // Always log to console for immediate visibility
    if (this.config.storageType === 'console' || this.config.storageType === 'hybrid') {
      this.logToConsole(event)
    }

    // Store in database if configured
    if (this.config.storageType === 'database' || this.config.storageType === 'hybrid') {
      await this.addToBatch(event)
    }
  }

  /**
   * Store database-specific audit event with state capture
   */
  async storeDatabaseAuditEvent(event: DatabaseAuditEvent): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Compress or limit state capture if configured
    const processedEvent = await this.processStateCapture(event)

    // Store the event
    await this.storeAuditEvent(processedEvent)

    // Store database-specific data separately if using database storage
    if (this.config.storageType === 'database' || this.config.storageType === 'hybrid') {
      // This will be handled by the batch processing with extended data
    }
  }

  /**
   * Process state capture based on configuration
   */
  private async processStateCapture(event: DatabaseAuditEvent): Promise<DatabaseAuditEvent> {
    if (!this.config.enableStateCapture) {
      // Remove state data if disabled
      const { before_state, after_state, ...eventWithoutState } = event
      return eventWithoutState as DatabaseAuditEvent
    }

    const processed = { ...event }
    let totalStateSize = 0

    // Calculate state size
    if (processed.before_state) {
      const beforeSize = JSON.stringify(processed.before_state).length
      totalStateSize += beforeSize
    }

    if (processed.after_state) {
      const afterSize = JSON.stringify(processed.after_state).length
      totalStateSize += afterSize
    }

    // Check if state exceeds size limit
    const maxSizeBytes = this.config.maxStateSizeKB * 1024
    if (totalStateSize > maxSizeBytes) {
      console.warn(`⚠️ Audit state size ${totalStateSize} bytes exceeds limit ${maxSizeBytes} bytes, truncating`)

      // Truncate or remove state data
      if (processed.before_state) {
        processed.before_state = { truncated: true, original_size: totalStateSize }
      }
      if (processed.after_state) {
        processed.after_state = { truncated: true, original_size: totalStateSize }
      }
    }

    // Add state size metadata
    processed.details = {
      ...processed.details,
      state_size_bytes: totalStateSize,
      state_captured: this.config.enableStateCapture,
      compressed: this.config.compressionEnabled
    }

    return processed
  }

  /**
   * Add event to batch for database storage
   */
  private async addToBatch(event: AuditEvent): Promise<void> {
    const storedEvent: StoredAuditEvent = {
      ...event,
      created_at: new Date(event.timestamp)
    }

    auditBatch.events.push(storedEvent)
    auditBatch.size += JSON.stringify(storedEvent).length

    // Check if batch should be flushed
    if (auditBatch.events.length >= this.config.batchSize ||
        auditBatch.size > 1024 * 1024) { // 1MB batch size limit
      await this.flushBatch()
    }
  }

  /**
   * Flush batch to database
   */
  private async flushBatch(): Promise<void> {
    if (auditBatch.events.length === 0) return

    try {
      const events = [...auditBatch.events] // Copy for processing
      auditBatch = { events: [], size: 0, createdAt: Date.now() } // Reset batch

      await this.writeBatchToDatabase(events)
      console.log(`📝 Flushed ${events.length} audit events to database`)

    } catch (error) {
      console.error('❌ Failed to flush audit batch:', error)

      // On error, could implement retry logic or fallback to console logging
      auditBatch.events.forEach(event => this.logToConsole(event))
    }
  }

  /**
   * Write batch of events to database
   */
  private async writeBatchToDatabase(events: StoredAuditEvent[]): Promise<void> {
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection() // Use default connection (environment-based MySQL)

    if (!mysql.isConnected) {
      await mysql.connect()
    }

    // Split into regular audit events and database-specific events
    const regularEvents: StoredAuditEvent[] = []
    const databaseEvents: (StoredAuditEvent & Partial<DatabaseAuditEvent>)[] = []

    for (const event of events) {
      if (event.event_type.startsWith('database.')) {
        databaseEvents.push(event as any)
      } else {
        regularEvents.push(event)
      }
    }

    // Insert regular audit events
    if (regularEvents.length > 0) {
      await this.insertAuditEvents(mysql, regularEvents)
    }

    // Insert database-specific events with extended data
    if (databaseEvents.length > 0) {
      await this.insertDatabaseAuditEvents(mysql, databaseEvents)
    }
  }

  /**
   * Insert regular audit events
   */
  private async insertAuditEvents(mysql: any, events: StoredAuditEvent[]): Promise<void> {
    const values = events.map(event => {
      // Safely convert timestamp to MySQL datetime format
      let mysqlTimestamp: string
      try {
        const timestamp = event.timestamp || event.created_at || new Date().toISOString()
        mysqlTimestamp = new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')
      } catch (error) {
        // Fallback to current time if timestamp is invalid
        mysqlTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
      }

      return [
        mysqlTimestamp,
        event.event_type,
        event.user_id || null,
        event.user_email || null,
        event.client_id || null,
        event.ip_address || null,
        event.user_agent || null,
        event.session_id || null,
        event.resource || null,
        event.action,
        event.result,
        event.risk_level,
        JSON.stringify(event.details || {})
      ]
    })

    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
    const sql = `
      INSERT INTO audit_events (
        timestamp, event_type, user_id, user_email, client_id, ip_address,
        user_agent, session_id, resource, action, result, risk_level, details
      ) VALUES ${placeholders}
    `

    const flatValues = values.flat()
    await mysql.query(sql, flatValues)
  }

  /**
   * Insert database-specific audit events
   */
  private async insertDatabaseAuditEvents(
    mysql: any,
    events: (StoredAuditEvent & Partial<DatabaseAuditEvent>)[]
  ): Promise<void> {
    // Insert into audit_events first (without duplication)
    const auditEventIds: number[] = []

    // Insert audit events and capture the IDs
    for (const event of events) {
      // Safely convert timestamp to MySQL datetime format
      let mysqlTimestamp: string
      try {
        const timestamp = event.timestamp || event.created_at || new Date().toISOString()
        mysqlTimestamp = new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')
      } catch (error) {
        // Fallback to current time if timestamp is invalid
        mysqlTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
      }

      const insertResult = await mysql.query(`
        INSERT INTO audit_events (
          timestamp, event_type, user_id, user_email, client_id, ip_address,
          user_agent, session_id, resource, action, result, risk_level, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        mysqlTimestamp,
        event.event_type,
        event.user_id || null,
        event.user_email || null,
        event.client_id || null,
        event.ip_address || null,
        event.user_agent || null,
        event.session_id || null,
        event.resource || null,
        event.action,
        event.result,
        event.risk_level,
        JSON.stringify(event.details || {})
      ])

      // Get the inserted ID
      const auditEventId = insertResult.insertId
      if (auditEventId) {
        auditEventIds.push(auditEventId)
      }
    }

    // Now insert database-specific data with the correct audit_event_ids
    const dbValues = events.map((event, index) => {
      const auditEventId = auditEventIds[index]
      if (!auditEventId) return null

      return [
        auditEventId,
        event.database_type || 'neo4j',
        event.operation_type || 'READ',
        event.query_hash || '',
        event.affected_nodes || 0,
        event.affected_relationships || 0,
        event.execution_time_ms || 0,
        event.complexity_score || 0,
        event.transaction_id || null,
        JSON.stringify(event.query_parameters || {}),
        event.before_state ? JSON.stringify(event.before_state) : null,
        event.after_state ? JSON.stringify(event.after_state) : null,
        event.details?.state_size_bytes || 0,
        event.details?.compressed || false
      ]
    }).filter(Boolean)

    if (dbValues.length > 0) {
      const dbPlaceholders = dbValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
      const dbSql = `
        INSERT INTO database_audit_events (
          audit_event_id, database_type, operation_type, query_hash, affected_nodes,
          affected_relationships, execution_time_ms, complexity_score, transaction_id,
          query_parameters, before_state, after_state, state_size_bytes, compressed
        ) VALUES ${dbPlaceholders}
      `

      const flatDbValues = dbValues.flat()
      await mysql.query(dbSql, flatDbValues)
    }
  }

  /**
   * Log to console (always enabled for immediate visibility)
   */
  private logToConsole(event: AuditEvent): void {
    const logLevel = event.risk_level === 'critical' || event.risk_level === 'high' ? 'error' :
                     event.risk_level === 'medium' ? 'warn' : 'info'

    const logMessage = {
      audit: true,
      storage: this.config.storageType,
      ...event
    }

    console[logLevel](`[AUDIT] ${JSON.stringify(logMessage)}`)

    // Alert on high-risk events
    if (event.risk_level === 'critical' || event.risk_level === 'high') {
      console.error(`🚨 HIGH RISK AUDIT EVENT: ${event.event_type} - ${event.action}`)
    }
  }

  /**
   * Initialize database schema
   */
  private async initializeDatabase(): Promise<void> {
    try {
      console.log('🔧 Starting audit database initialization...')

      const dbManager = await getGlobalDatabaseManager()
      const mysql = dbManager.getConnection() // Use default connection (environment-based MySQL)

      console.log('🔗 Got database connection, checking if connected...')
      if (!mysql.isConnected) {
        console.log('🔗 Connecting to database...')
        await mysql.connect()
      }
      console.log('✅ Database connected successfully')

      // Execute schema creation with better error handling
      const statements = AUDIT_SCHEMA_SQL.split(';').filter(stmt => stmt.trim())
      console.log(`📝 Executing ${statements.length} SQL statements...`)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim()
        if (statement) {
          try {
            console.log(`🔄 Executing statement ${i + 1}/${statements.length}`)
            await mysql.query(statement)
            console.log(`✅ Statement ${i + 1} executed successfully`)
          } catch (statementError) {
            console.error(`❌ Failed to execute statement ${i + 1}:`, statementError)
            console.error(`📝 Statement was: ${statement.substring(0, 100)}...`)
            throw statementError
          }
        }
      }

      console.log('✅ Audit database schema initialized successfully')

    } catch (error) {
      console.error('❌ Failed to initialize audit database:', error)
      console.error('🔍 Full error details:', JSON.stringify(error, null, 2))
      // Temporarily throw error to see exact issue
      throw error
    }
  }

  /**
   * Start batch flushing timer
   */
  private startBatchFlushing(): void {
    if (flushTimer) {
      clearInterval(flushTimer)
    }

    flushTimer = setInterval(() => {
      this.flushBatch().catch(error => {
        console.error('❌ Scheduled batch flush failed:', error)
      })
    }, this.config.flushIntervalMs)

    // Flush on process exit
    process.on('SIGINT', () => this.flushBatch())
    process.on('SIGTERM', () => this.flushBatch())
  }

  /**
   * Get current configuration
   */
  getConfig(): AuditStorageConfig {
    return { ...this.config }
  }

  /**
   * Update configuration (for runtime changes)
   */
  updateConfig(updates: Partial<AuditStorageConfig>): void {
    this.config = { ...this.config, ...updates }
    console.log(`🔧 Audit storage config updated:`, updates)
  }

  /**
   * Force flush current batch
   */
  async forceFlush(): Promise<void> {
    await this.flushBatch()
  }

  /**
   * Get batch status
   */
  getBatchStatus(): { events: number; size: number; age: number } {
    return {
      events: auditBatch.events.length,
      size: auditBatch.size,
      age: Date.now() - auditBatch.createdAt
    }
  }
}

// Global audit storage manager instance
let globalAuditStorage: AuditStorageManager | null = null

/**
 * Get global audit storage manager
 */
export async function getGlobalAuditStorage(): Promise<AuditStorageManager> {
  if (!globalAuditStorage) {
    globalAuditStorage = new AuditStorageManager()
    await globalAuditStorage.initialize()
  }
  return globalAuditStorage
}

/**
 * Store audit event using global manager
 */
export async function storeAuditEvent(event: AuditEvent): Promise<void> {
  const storage = await getGlobalAuditStorage()
  await storage.storeAuditEvent(event)
}

/**
 * Store database audit event using global manager
 */
export async function storeDatabaseAuditEvent(event: DatabaseAuditEvent): Promise<void> {
  const storage = await getGlobalAuditStorage()
  await storage.storeDatabaseAuditEvent(event)
}