/**
 * Audit Query API Endpoint
 * Provides REST API for querying audit events with filtering and export capabilities
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGlobalDatabaseManager } from '../../../lib/database/index'
import { AUTH_CONFIG } from '../../../lib/config'

// Query parameters interface
interface AuditQueryParams {
  // Time range
  startDate?: string
  endDate?: string

  // Filtering
  eventType?: string
  userId?: string
  userEmail?: string
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  result?: 'success' | 'failure' | 'warning'
  databaseType?: 'neo4j' | 'mysql'
  operationType?: 'CREATE' | 'MERGE' | 'SET' | 'READ'

  // Pagination
  page?: number
  limit?: number

  // Export
  format?: 'json' | 'csv'

  // Search
  search?: string
}

// Authentication check
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key')
  return apiKey === AUTH_CONFIG.API_KEY
}

// Parse query parameters
function parseQueryParams(url: URL): AuditQueryParams {
  const params = new URLSearchParams(url.search)

  return {
    startDate: params.get('startDate') || undefined,
    endDate: params.get('endDate') || undefined,
    eventType: params.get('eventType') || undefined,
    userId: params.get('userId') || undefined,
    userEmail: params.get('userEmail') || undefined,
    riskLevel: params.get('riskLevel') as any || undefined,
    result: params.get('result') as any || undefined,
    databaseType: params.get('databaseType') as any || undefined,
    operationType: params.get('operationType') as any || undefined,
    page: params.get('page') ? parseInt(params.get('page')!) : 1,
    limit: Math.min(parseInt(params.get('limit') || '50'), 1000), // Max 1000 results
    format: params.get('format') as any || 'json',
    search: params.get('search') || undefined
  }
}

// Build SQL query with filters
function buildAuditQuery(params: AuditQueryParams): { sql: string; values: any[] } {
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

  // Time range filters
  if (params.startDate) {
    sql += ` AND ae.timestamp >= ?`
    values.push(params.startDate)
  }

  if (params.endDate) {
    sql += ` AND ae.timestamp <= ?`
    values.push(params.endDate)
  }

  // Event type filter (supports wildcard patterns)
  if (params.eventType) {
    if (params.eventType.includes('%')) {
      sql += ` AND ae.event_type LIKE ?`
      values.push(params.eventType)
    } else {
      sql += ` AND ae.event_type = ?`
      values.push(params.eventType)
    }
  }

  // User filters
  if (params.userId) {
    sql += ` AND ae.user_id = ?`
    values.push(params.userId)
  }

  if (params.userEmail) {
    sql += ` AND ae.user_email = ?`
    values.push(params.userEmail)
  }

  // Risk and result filters
  if (params.riskLevel) {
    sql += ` AND ae.risk_level = ?`
    values.push(params.riskLevel)
  }

  if (params.result) {
    sql += ` AND ae.result = ?`
    values.push(params.result)
  }

  // Database-specific filters
  if (params.databaseType) {
    sql += ` AND dae.database_type = ?`
    values.push(params.databaseType)
  }

  if (params.operationType) {
    sql += ` AND dae.operation_type = ?`
    values.push(params.operationType)
  }

  // Search filter (searches across multiple text fields)
  if (params.search) {
    sql += ` AND (
      ae.action LIKE ? OR
      ae.event_type LIKE ? OR
      ae.user_email LIKE ? OR
      JSON_EXTRACT(ae.details, '$') LIKE ?
    )`
    const searchTerm = `%${params.search}%`
    values.push(searchTerm, searchTerm, searchTerm, searchTerm)
  }

  // Order by timestamp (newest first)
  sql += ` ORDER BY ae.timestamp DESC`

  // Pagination
  const offset = (params.page! - 1) * params.limit!
  sql += ` LIMIT ? OFFSET ?`
  values.push(params.limit, offset)

  return { sql, values }
}

// Convert query results to CSV
function convertToCSV(data: any[]): string {
  if (data.length === 0) return ''

  const headers = Object.keys(data[0])
  const csvHeaders = headers.join(',')

  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header]

      // Handle JSON fields
      if (typeof value === 'object' && value !== null) {
        return `"${JSON.stringify(value).replace(/"/g, '""')}"`
      }

      // Handle null/undefined
      if (value === null || value === undefined) {
        return ''
      }

      // Handle strings with commas or quotes
      const stringValue = String(value)
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }

      return stringValue
    }).join(',')
  })

  return [csvHeaders, ...csvRows].join('\n')
}

// GET endpoint for querying audit events
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      )
    }

    // Parse query parameters
    const params = parseQueryParams(new URL(request.url))

    // Get database connection
    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    if (!mysql.isConnected) {
      await mysql.connect()
    }

    // Build and execute query
    const { sql, values } = buildAuditQuery(params)
    const result = await mysql.query(sql, values)
    const events = result.data || []

    // Get total count for pagination (without LIMIT)
    const countSql = sql.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM')
                        .replace(/ORDER BY.*$/, '')
                        .replace(/LIMIT.*$/, '')
    const countValues = values.slice(0, -2) // Remove LIMIT and OFFSET values
    const countResult = await mysql.query(countSql, countValues)
    const total = countResult.data?.[0]?.total || 0

    // Handle CSV export
    if (params.format === 'csv') {
      const csv = convertToCSV(events)

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-events-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    }

    // Return JSON response with pagination info
    const response = {
      events,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit!),
        hasNext: params.page! * params.limit! < total,
        hasPrevious: params.page! > 1
      },
      filters: {
        startDate: params.startDate,
        endDate: params.endDate,
        eventType: params.eventType,
        userId: params.userId,
        userEmail: params.userEmail,
        riskLevel: params.riskLevel,
        result: params.result,
        databaseType: params.databaseType,
        operationType: params.operationType,
        search: params.search
      }
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('Audit query error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    )
  }
}

// POST endpoint for complex audit queries and aggregations
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid API key' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { queryType, ...queryParams } = body

    const dbManager = await getGlobalDatabaseManager()
    const mysql = dbManager.getConnection('mysql')

    if (!mysql.isConnected) {
      await mysql.connect()
    }

    let result: any

    switch (queryType) {
      case 'risk_summary':
        // Risk level distribution
        result = await mysql.query(`
          SELECT
            risk_level,
            COUNT(*) as count,
            COUNT(*) * 100.0 / (SELECT COUNT(*) FROM audit_events) as percentage
          FROM audit_events
          WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY risk_level
          ORDER BY FIELD(risk_level, 'low', 'medium', 'high', 'critical')
        `)
        break

      case 'database_operations':
        // Database operation statistics
        result = await mysql.query(`
          SELECT
            dae.database_type,
            dae.operation_type,
            COUNT(*) as count,
            AVG(dae.execution_time_ms) as avg_execution_time,
            MAX(dae.execution_time_ms) as max_execution_time,
            AVG(dae.complexity_score) as avg_complexity
          FROM database_audit_events dae
          JOIN audit_events ae ON dae.audit_event_id = ae.id
          WHERE ae.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          GROUP BY dae.database_type, dae.operation_type
          ORDER BY count DESC
        `)
        break

      case 'user_activity':
        // User activity summary
        result = await mysql.query(`
          SELECT
            user_email,
            COUNT(*) as total_events,
            COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END) as high_risk_events,
            MAX(timestamp) as last_activity
          FROM audit_events
          WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            AND user_email IS NOT NULL
          GROUP BY user_email
          ORDER BY total_events DESC
          LIMIT 20
        `)
        break

      case 'timeline':
        // Timeline of events
        const timeframe = queryParams.timeframe || '24h'
        const interval = timeframe === '24h' ? 'HOUR' : timeframe === '7d' ? 'DAY' : 'HOUR'

        result = await mysql.query(`
          SELECT
            DATE_FORMAT(timestamp, '${interval === 'HOUR' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d'}') as time_bucket,
            COUNT(*) as event_count,
            COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END) as high_risk_count
          FROM audit_events
          WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ${timeframe === '24h' ? '24 HOUR' : '7 DAY'})
          GROUP BY time_bucket
          ORDER BY time_bucket
        `)
        break

      default:
        return NextResponse.json(
          { error: 'Invalid query type' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      queryType,
      data: result.data || [],
      generatedAt: new Date().toISOString()
    })

  } catch (error) {
    console.error('Audit aggregation query error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    )
  }
}