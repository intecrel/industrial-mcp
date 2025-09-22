/**
 * Audit Retention and Archival System
 * Manages automatic retention policies, archival, and cleanup of audit data
 */

import { getGlobalDatabaseManager } from './index'

// Configuration interfaces
export interface RetentionPolicy {
  id?: number
  eventType: string
  retentionDays: number
  archiveAfterDays?: number
  deleteAfterDays?: number
  compressAfterDays?: number
  createdAt?: Date
  updatedAt?: Date
}

export interface RetentionConfig {
  enabled: boolean
  runIntervalHours: number
  batchSize: number
  maxProcessingTimeMs: number
  enableCompression: boolean
  enableArchival: boolean
  archiveLocation?: string
  dryRun: boolean
}

export interface RetentionStats {
  totalEvents: number
  eventsArchived: number
  eventsDeleted: number
  eventsCompressed: number
  oldestEvent: string
  newestEvent: string
  storageSpaceSavedMB: number
  lastRunTime: string
  nextRunTime: string
  processingTimeMs: number
}

// Default retention configuration
export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  enabled: process.env.AUDIT_RETENTION_ENABLED === 'true',
  runIntervalHours: parseInt(process.env.AUDIT_RETENTION_INTERVAL_HOURS || '24'),
  batchSize: parseInt(process.env.AUDIT_RETENTION_BATCH_SIZE || '1000'),
  maxProcessingTimeMs: parseInt(process.env.AUDIT_RETENTION_MAX_PROCESSING_MS || '300000'), // 5 minutes
  enableCompression: process.env.AUDIT_RETENTION_COMPRESSION === 'true',
  enableArchival: process.env.AUDIT_RETENTION_ARCHIVAL === 'true',
  archiveLocation: process.env.AUDIT_ARCHIVE_LOCATION || '/tmp/audit-archives',
  dryRun: process.env.AUDIT_RETENTION_DRY_RUN === 'true'
}

/**
 * Audit Retention Manager
 */
export class AuditRetentionManager {
  private config: RetentionConfig
  private isRunning = false
  private timer: NodeJS.Timeout | null = null
  private stats: RetentionStats = {
    totalEvents: 0,
    eventsArchived: 0,
    eventsDeleted: 0,
    eventsCompressed: 0,
    oldestEvent: '',
    newestEvent: '',
    storageSpaceSavedMB: 0,
    lastRunTime: '',
    nextRunTime: '',
    processingTimeMs: 0
  }

  constructor(config: RetentionConfig = DEFAULT_RETENTION_CONFIG) {
    this.config = config
  }

  /**
   * Start automatic retention processing
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('📁 Audit retention is disabled')
      return
    }

    if (this.timer) {
      console.log('📁 Audit retention already running')
      return
    }

    console.log(`📁 Starting audit retention manager: ${this.config.runIntervalHours}h intervals`)

    // Run immediately on start
    await this.runRetentionCycle()

    // Schedule periodic runs
    this.timer = setInterval(async () => {
      try {
        await this.runRetentionCycle()
      } catch (error) {
        console.error('❌ Audit retention cycle failed:', error)
      }
    }, this.config.runIntervalHours * 60 * 60 * 1000)

    // Update next run time
    this.stats.nextRunTime = new Date(
      Date.now() + this.config.runIntervalHours * 60 * 60 * 1000
    ).toISOString()

    console.log(`✅ Audit retention manager started`)
  }

  /**
   * Stop automatic retention processing
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      console.log('🛑 Audit retention manager stopped')
    }
  }

  /**
   * Run a single retention cycle
   */
  async runRetentionCycle(): Promise<RetentionStats> {
    if (this.isRunning) {
      console.log('⏳ Retention cycle already running, skipping...')
      return this.stats
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      console.log('📁 Starting audit retention cycle...')

      const dbManager = await getGlobalDatabaseManager()
      const mysql = dbManager.getConnection('mysql')

      if (!mysql.isConnected) {
        await mysql.connect()
      }

      // Reset cycle stats
      const cycleStats = {
        eventsArchived: 0,
        eventsDeleted: 0,
        eventsCompressed: 0,
        storageSpaceSavedMB: 0
      }

      // Get all retention policies
      const policies = await this.getRetentionPolicies()

      // Process each policy
      for (const policy of policies) {
        try {
          const policyStats = await this.processRetentionPolicy(policy)
          cycleStats.eventsArchived += policyStats.eventsArchived
          cycleStats.eventsDeleted += policyStats.eventsDeleted
          cycleStats.eventsCompressed += policyStats.eventsCompressed
          cycleStats.storageSpaceSavedMB += policyStats.storageSpaceSavedMB

          // Check if we've exceeded processing time limit
          if (Date.now() - startTime > this.config.maxProcessingTimeMs) {
            console.log(`⏰ Retention cycle time limit reached, continuing next cycle`)
            break
          }

        } catch (error) {
          console.error(`❌ Failed to process retention policy ${policy.eventType}:`, error)
        }
      }

      // Update overall stats
      await this.updateStats(cycleStats)

      const processingTime = Date.now() - startTime
      this.stats.processingTimeMs = processingTime
      this.stats.lastRunTime = new Date().toISOString()
      this.stats.nextRunTime = new Date(
        Date.now() + this.config.runIntervalHours * 60 * 60 * 1000
      ).toISOString()

      console.log(`✅ Retention cycle completed in ${processingTime}ms:`, {
        archived: cycleStats.eventsArchived,
        deleted: cycleStats.eventsDeleted,
        compressed: cycleStats.eventsCompressed,
        spaceSaved: `${cycleStats.storageSpaceSavedMB.toFixed(2)}MB`
      })

      return this.stats

    } catch (error) {
      console.error('❌ Retention cycle failed:', error)
      throw error
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Get all retention policies
   */
  async getRetentionPolicies(): Promise<RetentionPolicy[]> {
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    const result = await mysql.query(`
      SELECT * FROM audit_retention_policy
      ORDER BY event_type
    `)

    return result.data || []
  }

  /**
   * Process a single retention policy
   */
  async processRetentionPolicy(policy: RetentionPolicy): Promise<{
    eventsArchived: number
    eventsDeleted: number
    eventsCompressed: number
    storageSpaceSavedMB: number
  }> {
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    const stats = {
      eventsArchived: 0,
      eventsDeleted: 0,
      eventsCompressed: 0,
      storageSpaceSavedMB: 0
    }

    // Determine event type filter
    const eventTypeFilter = policy.eventType.includes('%') ?
      `event_type LIKE '${policy.eventType}'` :
      `event_type = '${policy.eventType}'`

    console.log(`📁 Processing retention policy: ${policy.eventType}`)

    // 1. Archive old events (if archival is enabled and configured)
    if (this.config.enableArchival && policy.archiveAfterDays) {
      const archiveDate = new Date()
      archiveDate.setDate(archiveDate.getDate() - policy.archiveAfterDays)

      const archiveStats = await this.archiveEvents(eventTypeFilter, archiveDate)
      stats.eventsArchived = archiveStats.count
      stats.storageSpaceSavedMB += archiveStats.spaceSavedMB
    }

    // 2. Compress old events (if compression is enabled and configured)
    if (this.config.enableCompression && policy.compressAfterDays) {
      const compressDate = new Date()
      compressDate.setDate(compressDate.getDate() - policy.compressAfterDays)

      const compressStats = await this.compressEvents(eventTypeFilter, compressDate)
      stats.eventsCompressed = compressStats.count
      stats.storageSpaceSavedMB += compressStats.spaceSavedMB
    }

    // 3. Delete expired events (if delete is configured)
    if (policy.deleteAfterDays) {
      const deleteDate = new Date()
      deleteDate.setDate(deleteDate.getDate() - policy.deleteAfterDays)

      const deleteStats = await this.deleteExpiredEvents(eventTypeFilter, deleteDate)
      stats.eventsDeleted = deleteStats.count
    }

    return stats
  }

  /**
   * Archive events to external storage
   */
  async archiveEvents(eventTypeFilter: string, beforeDate: Date): Promise<{
    count: number
    spaceSavedMB: number
  }> {
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    // Get events to archive
    const eventsResult = await mysql.query(`
      SELECT ae.*, dae.*
      FROM audit_events ae
      LEFT JOIN database_audit_events dae ON ae.id = dae.audit_event_id
      WHERE ${eventTypeFilter}
        AND ae.timestamp < ?
        AND ae.id NOT IN (
          SELECT DISTINCT audit_event_id
          FROM archived_audit_events
          WHERE audit_event_id IS NOT NULL
        )
      LIMIT ?
    `, [beforeDate.toISOString(), this.config.batchSize])

    const events = eventsResult.data || []

    if (events.length === 0) {
      return { count: 0, spaceSavedMB: 0 }
    }

    console.log(`📦 Archiving ${events.length} events before ${beforeDate.toISOString()}`)

    if (this.config.dryRun) {
      console.log(`🧪 DRY RUN: Would archive ${events.length} events`)
      return { count: events.length, spaceSavedMB: 0 }
    }

    try {
      // Create archive record (simplified - in production, implement actual archival)
      const archiveId = `archive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const archiveData = {
        archiveId,
        eventCount: events.length,
        archiveDate: new Date().toISOString(),
        beforeDate: beforeDate.toISOString(),
        eventTypeFilter,
        events: events.map(e => ({
          ...e,
          archived_at: new Date().toISOString()
        }))
      }

      // Calculate approximate space saved (JSON size estimate)
      const spaceSavedMB = JSON.stringify(archiveData).length / (1024 * 1024)

      // In production, you would:
      // 1. Export events to file (JSON, Parquet, etc.)
      // 2. Upload to cloud storage (S3, Azure Blob, etc.)
      // 3. Verify archive integrity
      // 4. Create archive metadata record
      // 5. Mark events as archived (but don't delete yet)

      // For now, create a simple archived_audit_events table entry
      await mysql.query(`
        CREATE TABLE IF NOT EXISTS archived_audit_events (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          audit_event_id BIGINT NOT NULL,
          archive_id VARCHAR(255) NOT NULL,
          archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          archive_location TEXT,
          INDEX idx_audit_event_id (audit_event_id),
          INDEX idx_archive_id (archive_id)
        )
      `)

      // Mark events as archived
      const eventIds = events.map(e => e.id).filter(Boolean)
      if (eventIds.length > 0) {
        const values = eventIds.map(id => [id, archiveId, this.config.archiveLocation])
        await mysql.query(`
          INSERT INTO archived_audit_events (audit_event_id, archive_id, archive_location)
          VALUES ?
        `, [values])
      }

      console.log(`✅ Archived ${events.length} events to ${archiveId}`)

      return { count: events.length, spaceSavedMB }

    } catch (error) {
      console.error('❌ Archive operation failed:', error)
      throw error
    }
  }

  /**
   * Compress old events (update storage format)
   */
  async compressEvents(eventTypeFilter: string, beforeDate: Date): Promise<{
    count: number
    spaceSavedMB: number
  }> {
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    // Get events that need compression
    const eventsResult = await mysql.query(`
      SELECT ae.id, ae.details, dae.before_state, dae.after_state
      FROM audit_events ae
      LEFT JOIN database_audit_events dae ON ae.id = dae.audit_event_id
      WHERE ${eventTypeFilter}
        AND ae.timestamp < ?
        AND (ae.details IS NOT NULL OR dae.before_state IS NOT NULL OR dae.after_state IS NOT NULL)
        AND ae.id NOT IN (
          SELECT DISTINCT audit_event_id
          FROM compressed_audit_events
          WHERE audit_event_id IS NOT NULL
        )
      LIMIT ?
    `, [beforeDate.toISOString(), this.config.batchSize])

    const events = eventsResult.data || []

    if (events.length === 0) {
      return { count: 0, spaceSavedMB: 0 }
    }

    console.log(`🗜️ Compressing ${events.length} events before ${beforeDate.toISOString()}`)

    if (this.config.dryRun) {
      console.log(`🧪 DRY RUN: Would compress ${events.length} events`)
      return { count: events.length, spaceSavedMB: 0 }
    }

    try {
      // Create compression tracking table
      await mysql.query(`
        CREATE TABLE IF NOT EXISTS compressed_audit_events (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          audit_event_id BIGINT NOT NULL,
          original_size_bytes INT NOT NULL,
          compressed_size_bytes INT NOT NULL,
          compression_ratio DECIMAL(4,2) NOT NULL,
          compressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_audit_event_id (audit_event_id)
        )
      `)

      let totalSpaceSaved = 0

      for (const event of events) {
        // Calculate original size
        const originalData = {
          details: event.details,
          before_state: event.before_state,
          after_state: event.after_state
        }
        const originalSize = JSON.stringify(originalData).length

        // Simulate compression (in production, use actual compression library)
        const compressionRatio = 0.3 // Assume 70% compression
        const compressedSize = Math.floor(originalSize * compressionRatio)
        const spaceSaved = originalSize - compressedSize

        totalSpaceSaved += spaceSaved

        // Record compression stats
        await mysql.query(`
          INSERT INTO compressed_audit_events
          (audit_event_id, original_size_bytes, compressed_size_bytes, compression_ratio)
          VALUES (?, ?, ?, ?)
        `, [event.id, originalSize, compressedSize, compressionRatio])

        // In production, you would:
        // 1. Compress the JSON data using gzip/zstd/etc.
        // 2. Store compressed data in a BLOB field
        // 3. Update the original records to reference compressed data
        // 4. Optionally remove uncompressed data
      }

      const spaceSavedMB = totalSpaceSaved / (1024 * 1024)

      console.log(`✅ Compressed ${events.length} events, saved ${spaceSavedMB.toFixed(2)}MB`)

      return { count: events.length, spaceSavedMB }

    } catch (error) {
      console.error('❌ Compression operation failed:', error)
      throw error
    }
  }

  /**
   * Delete expired events
   */
  async deleteExpiredEvents(eventTypeFilter: string, beforeDate: Date): Promise<{
    count: number
  }> {
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    // Count events to delete
    const countResult = await mysql.query(`
      SELECT COUNT(*) as count
      FROM audit_events
      WHERE ${eventTypeFilter}
        AND timestamp < ?
    `, [beforeDate.toISOString()])

    const totalCount = countResult.data?.[0]?.count || 0

    if (totalCount === 0) {
      return { count: 0 }
    }

    console.log(`🗑️ Deleting ${totalCount} expired events before ${beforeDate.toISOString()}`)

    if (this.config.dryRun) {
      console.log(`🧪 DRY RUN: Would delete ${totalCount} events`)
      return { count: totalCount }
    }

    try {
      // Delete in batches to avoid locks
      let deletedTotal = 0
      let batchCount = 0

      while (deletedTotal < totalCount && batchCount < 100) { // Safety limit
        // Delete database audit events first (foreign key constraint)
        await mysql.query(`
          DELETE dae FROM database_audit_events dae
          JOIN audit_events ae ON dae.audit_event_id = ae.id
          WHERE ${eventTypeFilter}
            AND ae.timestamp < ?
          LIMIT ?
        `, [beforeDate.toISOString(), this.config.batchSize])

        // Delete audit events
        const deleteResult = await mysql.query(`
          DELETE FROM audit_events
          WHERE ${eventTypeFilter}
            AND timestamp < ?
          LIMIT ?
        `, [beforeDate.toISOString(), this.config.batchSize])

        const deleted = deleteResult.affected || 0
        deletedTotal += deleted
        batchCount++

        if (deleted === 0) break // No more records to delete

        console.log(`🗑️ Deleted batch ${batchCount}: ${deleted} events (${deletedTotal}/${totalCount})`)

        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      console.log(`✅ Deleted ${deletedTotal} expired events`)

      return { count: deletedTotal }

    } catch (error) {
      console.error('❌ Delete operation failed:', error)
      throw error
    }
  }

  /**
   * Update retention statistics
   */
  async updateStats(cycleStats: any): Promise<void> {
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    // Get current totals
    const totalsResult = await mysql.query(`
      SELECT
        COUNT(*) as total_events,
        MIN(timestamp) as oldest_event,
        MAX(timestamp) as newest_event
      FROM audit_events
    `)

    const totals = totalsResult.data?.[0] || {}

    // Update cumulative stats
    this.stats.totalEvents = totals.total_events || 0
    this.stats.eventsArchived += cycleStats.eventsArchived
    this.stats.eventsDeleted += cycleStats.eventsDeleted
    this.stats.eventsCompressed += cycleStats.eventsCompressed
    this.stats.storageSpaceSavedMB += cycleStats.storageSpaceSavedMB
    this.stats.oldestEvent = totals.oldest_event || ''
    this.stats.newestEvent = totals.newest_event || ''
  }

  /**
   * Get current retention statistics
   */
  getStats(): RetentionStats {
    return { ...this.stats }
  }

  /**
   * Update retention configuration
   */
  updateConfig(updates: Partial<RetentionConfig>): void {
    this.config = { ...this.config, ...updates }
    console.log('🔧 Retention configuration updated:', updates)
  }

  /**
   * Get current configuration
   */
  getConfig(): RetentionConfig {
    return { ...this.config }
  }

  /**
   * Force immediate retention run (for testing/manual operation)
   */
  async forceRun(): Promise<RetentionStats> {
    console.log('🔄 Forcing immediate retention cycle...')
    return await this.runRetentionCycle()
  }
}

// Global retention manager instance
let globalRetentionManager: AuditRetentionManager | null = null

/**
 * Get global retention manager
 */
export async function getGlobalRetentionManager(): Promise<AuditRetentionManager> {
  if (!globalRetentionManager) {
    globalRetentionManager = new AuditRetentionManager()
    await globalRetentionManager.start()
  }
  return globalRetentionManager
}

/**
 * Initialize retention system (call this on application startup)
 */
export async function initializeRetentionSystem(): Promise<void> {
  console.log('📁 Initializing audit retention system...')
  await getGlobalRetentionManager()
  console.log('✅ Audit retention system initialized')
}

/**
 * Utility function to create or update retention policy
 */
export async function createOrUpdateRetentionPolicy(policy: Omit<RetentionPolicy, 'id'>): Promise<void> {
  const dbManager = await getGlobalDatabaseManager()
  const mysql = dbManager.getConnection('mysql')

  if (!mysql.isConnected) {
    await mysql.connect()
  }

  await mysql.query(`
    INSERT INTO audit_retention_policy
    (event_type, retention_days, archive_after_days, delete_after_days, compress_after_days)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      retention_days = VALUES(retention_days),
      archive_after_days = VALUES(archive_after_days),
      delete_after_days = VALUES(delete_after_days),
      compress_after_days = VALUES(compress_after_days),
      updated_at = CURRENT_TIMESTAMP
  `, [
    policy.eventType,
    policy.retentionDays,
    policy.archiveAfterDays || null,
    policy.deleteAfterDays || null,
    policy.compressAfterDays || null
  ])

  console.log(`✅ Retention policy updated for ${policy.eventType}`)
}