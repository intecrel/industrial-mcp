/**
 * Audit Query Utilities
 * Provides helper functions for querying and analyzing audit data
 */

import { getGlobalDatabaseManager } from './index'

// Query interfaces
export interface AuditQueryOptions {
  startDate?: Date | string
  endDate?: Date | string
  eventTypes?: string[]
  userIds?: string[]
  userEmails?: string[]
  riskLevels?: ('low' | 'medium' | 'high' | 'critical')[]
  results?: ('success' | 'failure' | 'warning')[]
  databaseTypes?: ('neo4j' | 'mysql')[]
  operationTypes?: ('CREATE' | 'MERGE' | 'SET' | 'READ')[]
  limit?: number
  offset?: number
}

export interface AuditSummary {
  totalEvents: number
  riskDistribution: Record<string, number>
  resultDistribution: Record<string, number>
  databaseOperations: Record<string, number>
  topUsers: Array<{ userEmail: string; eventCount: number }>
  recentHighRiskEvents: any[]
}

export interface DatabasePerformanceMetrics {
  databaseType: 'neo4j' | 'mysql'
  operationType: string
  avgExecutionTime: number
  maxExecutionTime: number
  totalOperations: number
  avgComplexity: number
  errorRate: number
}

export interface ComplianceReport {
  reportDate: string
  timeRange: { start: string; end: string }
  totalAuditEvents: number
  criticalEvents: number
  failedOperations: number
  unauthorizedAttempts: number
  dataChangeEvents: number
  retentionCompliance: {
    totalRetained: number
    oldestEvent: string
    complianceStatus: 'compliant' | 'warning' | 'violation'
  }
}

/**
 * Query audit events with filtering
 */
export async function queryAuditEvents(options: AuditQueryOptions = {}) {
  const dbManager = await getGlobalDatabaseManager()
  const mysql = dbManager.getConnection('mysql')

  if (!mysql.isConnected) {
    await mysql.connect()
  }

  let sql = `
    SELECT
      ae.id,
      ae.timestamp,
      ae.event_type,
      ae.user_id,
      ae.user_email,
      ae.client_id,
      ae.ip_address,
      ae.session_id,
      ae.resource,
      ae.action,
      ae.result,
      ae.risk_level,
      ae.details,
      ae.created_at,
      dae.database_type,
      dae.operation_type,
      dae.query_hash,
      dae.affected_nodes,
      dae.affected_relationships,
      dae.execution_time_ms,
      dae.complexity_score,
      dae.transaction_id
    FROM audit_events ae
    LEFT JOIN database_audit_events dae ON ae.id = dae.audit_event_id
    WHERE 1=1
  `

  const values: any[] = []

  // Build dynamic WHERE clauses
  if (options.startDate) {
    sql += ` AND ae.timestamp >= ?`
    values.push(options.startDate)
  }

  if (options.endDate) {
    sql += ` AND ae.timestamp <= ?`
    values.push(options.endDate)
  }

  if (options.eventTypes && options.eventTypes.length > 0) {
    const placeholders = options.eventTypes.map(() => '?').join(',')
    sql += ` AND ae.event_type IN (${placeholders})`
    values.push(...options.eventTypes)
  }

  if (options.userEmails && options.userEmails.length > 0) {
    const placeholders = options.userEmails.map(() => '?').join(',')
    sql += ` AND ae.user_email IN (${placeholders})`
    values.push(...options.userEmails)
  }

  if (options.riskLevels && options.riskLevels.length > 0) {
    const placeholders = options.riskLevels.map(() => '?').join(',')
    sql += ` AND ae.risk_level IN (${placeholders})`
    values.push(...options.riskLevels)
  }

  if (options.results && options.results.length > 0) {
    const placeholders = options.results.map(() => '?').join(',')
    sql += ` AND ae.result IN (${placeholders})`
    values.push(...options.results)
  }

  if (options.databaseTypes && options.databaseTypes.length > 0) {
    const placeholders = options.databaseTypes.map(() => '?').join(',')
    sql += ` AND dae.database_type IN (${placeholders})`
    values.push(...options.databaseTypes)
  }

  if (options.operationTypes && options.operationTypes.length > 0) {
    const placeholders = options.operationTypes.map(() => '?').join(',')
    sql += ` AND dae.operation_type IN (${placeholders})`
    values.push(...options.operationTypes)
  }

  sql += ` ORDER BY ae.timestamp DESC`

  if (options.limit) {
    sql += ` LIMIT ?`
    values.push(options.limit)

    if (options.offset) {
      sql += ` OFFSET ?`
      values.push(options.offset)
    }
  }

  const result = await mysql.query(sql, values)
  return result.data || []
}

/**
 * Get audit summary statistics
 */
export async function getAuditSummary(
  startDate?: Date | string,
  endDate?: Date | string
): Promise<AuditSummary> {
  const dbManager = await getGlobalDatabaseManager()
  const mysql = dbManager.getConnection('mysql')

  if (!mysql.isConnected) {
    await mysql.connect()
  }

  const dateFilter = startDate && endDate ?
    `WHERE timestamp BETWEEN '${startDate.toString()}' AND '${endDate.toString()}'` :
    startDate ? `WHERE timestamp >= '${startDate.toString()}'` :
    endDate ? `WHERE timestamp <= '${endDate.toString()}'` : ''

  // Total events
  const totalResult = await mysql.query(`
    SELECT COUNT(*) as total FROM audit_events ${dateFilter}
  `)
  const totalEvents = totalResult.data?.[0]?.total || 0

  // Risk distribution
  const riskResult = await mysql.query(`
    SELECT risk_level, COUNT(*) as count
    FROM audit_events ${dateFilter}
    GROUP BY risk_level
  `)
  const riskDistribution = (riskResult.data || []).reduce((acc: any, row: any) => {
    acc[row.risk_level] = row.count
    return acc
  }, {})

  // Result distribution
  const resultResult = await mysql.query(`
    SELECT result, COUNT(*) as count
    FROM audit_events ${dateFilter}
    GROUP BY result
  `)
  const resultDistribution = (resultResult.data || []).reduce((acc: any, row: any) => {
    acc[row.result] = row.count
    return acc
  }, {})

  // Database operations
  const dbResult = await mysql.query(`
    SELECT dae.database_type, dae.operation_type, COUNT(*) as count
    FROM database_audit_events dae
    JOIN audit_events ae ON dae.audit_event_id = ae.id
    ${dateFilter}
    GROUP BY dae.database_type, dae.operation_type
  `)
  const databaseOperations = (dbResult.data || []).reduce((acc: any, row: any) => {
    const key = `${row.database_type}.${row.operation_type}`
    acc[key] = row.count
    return acc
  }, {})

  // Top users
  const userResult = await mysql.query(`
    SELECT user_email, COUNT(*) as event_count
    FROM audit_events
    ${dateFilter}
    AND user_email IS NOT NULL
    GROUP BY user_email
    ORDER BY event_count DESC
    LIMIT 10
  `)
  const topUsers = userResult.data || []

  // Recent high-risk events
  const highRiskResult = await mysql.query(`
    SELECT *
    FROM audit_events
    WHERE risk_level IN ('high', 'critical')
    ${dateFilter ? dateFilter : ''}
    ORDER BY timestamp DESC
    LIMIT 20
  `)
  const recentHighRiskEvents = highRiskResult.data || []

  return {
    totalEvents,
    riskDistribution,
    resultDistribution,
    databaseOperations,
    topUsers,
    recentHighRiskEvents
  }
}

/**
 * Get database performance metrics
 */
export async function getDatabasePerformanceMetrics(
  timeframe: string = '24h'
): Promise<DatabasePerformanceMetrics[]> {
  const dbManager = await getGlobalDatabaseManager()
  const mysql = dbManager.getConnection('mysql')

  if (!mysql.isConnected) {
    await mysql.connect()
  }

  const interval = timeframe === '24h' ? '24 HOUR' :
                   timeframe === '7d' ? '7 DAY' :
                   timeframe === '30d' ? '30 DAY' : '24 HOUR'

  const result = await mysql.query(`
    SELECT
      dae.database_type,
      dae.operation_type,
      AVG(dae.execution_time_ms) as avg_execution_time,
      MAX(dae.execution_time_ms) as max_execution_time,
      COUNT(*) as total_operations,
      AVG(dae.complexity_score) as avg_complexity,
      (COUNT(CASE WHEN ae.result = 'failure' THEN 1 END) * 100.0 / COUNT(*)) as error_rate
    FROM database_audit_events dae
    JOIN audit_events ae ON dae.audit_event_id = ae.id
    WHERE ae.timestamp >= DATE_SUB(NOW(), INTERVAL ${interval})
    GROUP BY dae.database_type, dae.operation_type
    ORDER BY total_operations DESC
  `)

  return result.data || []
}

/**
 * Generate compliance report
 */
export async function generateComplianceReport(
  startDate: Date | string,
  endDate: Date | string
): Promise<ComplianceReport> {
  const dbManager = await getGlobalDatabaseManager()
  const mysql = dbManager.getConnection('mysql')

  if (!mysql.isConnected) {
    await mysql.connect()
  }

  const dateFilter = `WHERE timestamp BETWEEN '${startDate}' AND '${endDate}'`

  // Total audit events in time range
  const totalResult = await mysql.query(`
    SELECT COUNT(*) as total FROM audit_events ${dateFilter}
  `)
  const totalAuditEvents = totalResult.data?.[0]?.total || 0

  // Critical events
  const criticalResult = await mysql.query(`
    SELECT COUNT(*) as total FROM audit_events ${dateFilter} AND risk_level = 'critical'
  `)
  const criticalEvents = criticalResult.data?.[0]?.total || 0

  // Failed operations
  const failureResult = await mysql.query(`
    SELECT COUNT(*) as total FROM audit_events ${dateFilter} AND result = 'failure'
  `)
  const failedOperations = failureResult.data?.[0]?.total || 0

  // Unauthorized access attempts
  const unauthorizedResult = await mysql.query(`
    SELECT COUNT(*) as total FROM audit_events
    ${dateFilter} AND event_type LIKE 'security.unauthorized%'
  `)
  const unauthorizedAttempts = unauthorizedResult.data?.[0]?.total || 0

  // Data change events (CREATE, MERGE, SET operations)
  const dataChangeResult = await mysql.query(`
    SELECT COUNT(*) as total FROM database_audit_events dae
    JOIN audit_events ae ON dae.audit_event_id = ae.id
    ${dateFilter.replace('WHERE', 'WHERE ae.')} AND dae.operation_type IN ('CREATE', 'MERGE', 'SET')
  `)
  const dataChangeEvents = dataChangeResult.data?.[0]?.total || 0

  // Retention compliance check
  const retentionResult = await mysql.query(`
    SELECT
      COUNT(*) as total_retained,
      MIN(timestamp) as oldest_event
    FROM audit_events
  `)
  const retentionData = retentionResult.data?.[0] || {}
  const oldestEventDate = retentionData.oldest_event ? new Date(retentionData.oldest_event) : new Date()
  const daysSinceOldest = Math.floor((Date.now() - oldestEventDate.getTime()) / (1000 * 60 * 60 * 24))

  // Determine compliance status (example: 7 years = 2555 days)
  const maxRetentionDays = 2555
  let complianceStatus: 'compliant' | 'warning' | 'violation' = 'compliant'

  if (daysSinceOldest > maxRetentionDays + 30) {
    complianceStatus = 'violation'
  } else if (daysSinceOldest > maxRetentionDays) {
    complianceStatus = 'warning'
  }

  return {
    reportDate: new Date().toISOString(),
    timeRange: {
      start: startDate.toString(),
      end: endDate.toString()
    },
    totalAuditEvents,
    criticalEvents,
    failedOperations,
    unauthorizedAttempts,
    dataChangeEvents,
    retentionCompliance: {
      totalRetained: retentionData.total_retained || 0,
      oldestEvent: retentionData.oldest_event || '',
      complianceStatus
    }
  }
}

/**
 * Search audit events by text
 */
export async function searchAuditEvents(
  searchTerm: string,
  options: Omit<AuditQueryOptions, 'eventTypes'> = {}
) {
  const searchOptions = {
    ...options,
    eventTypes: undefined // Clear event types for text search
  }

  const dbManager = await getGlobalDatabaseManager()
  const mysql = dbManager.getConnection('mysql')

  if (!mysql.isConnected) {
    await mysql.connect()
  }

  let sql = `
    SELECT
      ae.id,
      ae.timestamp,
      ae.event_type,
      ae.user_email,
      ae.action,
      ae.result,
      ae.risk_level,
      ae.details,
      dae.database_type,
      dae.operation_type
    FROM audit_events ae
    LEFT JOIN database_audit_events dae ON ae.id = dae.audit_event_id
    WHERE (
      ae.action LIKE ? OR
      ae.event_type LIKE ? OR
      ae.user_email LIKE ? OR
      JSON_EXTRACT(ae.details, '$') LIKE ?
    )
  `

  const values = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]

  // Add additional filters
  if (searchOptions.startDate) {
    sql += ` AND ae.timestamp >= ?`
    values.push(searchOptions.startDate.toString())
  }

  if (searchOptions.endDate) {
    sql += ` AND ae.timestamp <= ?`
    values.push(searchOptions.endDate.toString())
  }

  if (searchOptions.riskLevels && searchOptions.riskLevels.length > 0) {
    const placeholders = searchOptions.riskLevels.map(() => '?').join(',')
    sql += ` AND ae.risk_level IN (${placeholders})`
    values.push(...searchOptions.riskLevels)
  }

  sql += ` ORDER BY ae.timestamp DESC`

  if (searchOptions.limit) {
    sql += ` LIMIT ?`
    values.push(searchOptions.limit.toString())

    if (searchOptions.offset) {
      sql += ` OFFSET ?`
      values.push(searchOptions.offset.toString())
    }
  }

  const result = await mysql.query(sql, values)
  return result.data || []
}

/**
 * Get audit event timeline data for visualization
 */
export async function getAuditTimeline(
  timeframe: '24h' | '7d' | '30d' = '24h',
  groupBy: 'hour' | 'day' = 'hour'
) {
  const dbManager = await getGlobalDatabaseManager()
  const mysql = dbManager.getConnection('mysql')

  if (!mysql.isConnected) {
    await mysql.connect()
  }

  const interval = timeframe === '24h' ? '24 HOUR' :
                   timeframe === '7d' ? '7 DAY' : '30 DAY'

  const dateFormat = groupBy === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d'

  const result = await mysql.query(`
    SELECT
      DATE_FORMAT(timestamp, '${dateFormat}') as time_bucket,
      COUNT(*) as total_events,
      COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_events,
      COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_events,
      COUNT(CASE WHEN result = 'failure' THEN 1 END) as failed_events
    FROM audit_events
    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ${interval})
    GROUP BY time_bucket
    ORDER BY time_bucket
  `)

  return result.data || []
}