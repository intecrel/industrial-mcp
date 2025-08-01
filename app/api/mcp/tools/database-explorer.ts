/**
 * Generic Database Explorer Tools
 * Provides flexible database exploration and analytics capabilities
 */

import { getGlobalDatabaseManager } from '@/lib/database'

export interface ExploreOptions {
  action: 'list_tables' | 'describe_table' | 'sample_data'
  table_name?: string
  limit?: number
}

export interface QueryOptions {
  query: string
  limit?: number
}

export interface AnalysisOptions {
  table_name: string
  analysis_type: 'summary' | 'trends' | 'distribution'
  date_column?: string
  group_by?: string
}

/**
 * Explore database structure and discover data
 */
export async function exploreDatabaseStructure(options: ExploreOptions) {
  const { action, table_name, limit = 10 } = options
  
  try {
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection()
    
    switch (action) {
      case 'list_tables':
        if (connection.type === 'mysql') {
          const result = await connection.query('SHOW TABLES')
          return {
            action: 'list_tables',
            database_type: connection.type,
            tables: result.data?.map(row => Object.values(row)[0]) || [],
            total_tables: result.data?.length || 0,
            timestamp: new Date().toISOString()
          }
        } else {
          throw new Error(`Table listing not yet supported for database type: ${connection.type}`)
        }
        
      case 'describe_table':
        if (!table_name) {
          throw new Error('table_name is required for describe_table action')
        }
        
        if (connection.type === 'mysql') {
          const result = await connection.query(`DESCRIBE \`${table_name}\``)
          return {
            action: 'describe_table',
            table_name,
            database_type: connection.type,
            columns: result.data || [],
            total_columns: result.data?.length || 0,
            timestamp: new Date().toISOString()
          }
        } else {
          throw new Error(`Table description not yet supported for database type: ${connection.type}`)
        }
        
      case 'sample_data':
        if (!table_name) {
          throw new Error('table_name is required for sample_data action')
        }
        
        const sampleResult = await connection.query(
          `SELECT * FROM \`${table_name}\` LIMIT ?`, 
          [Math.min(limit, 100)] // Cap at 100 for safety
        )
        
        return {
          action: 'sample_data',
          table_name,
          database_type: connection.type,
          sample_data: sampleResult.data || [],
          rows_returned: sampleResult.data?.length || 0,
          limit_applied: Math.min(limit, 100),
          timestamp: new Date().toISOString()
        }
        
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error('Database exploration error:', error)
    throw new Error(`Database exploration failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Execute custom SQL queries with safety checks
 */
export async function executeCustomQuery(options: QueryOptions) {
  const { query, limit = 100 } = options
  
  try {
    // Safety checks - only allow SELECT statements
    const trimmedQuery = query.trim().toLowerCase()
    if (!trimmedQuery.startsWith('select')) {
      throw new Error('Only SELECT queries are allowed for security reasons')
    }
    
    // Check for dangerous patterns
    const dangerousPatterns = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate']
    for (const pattern of dangerousPatterns) {
      if (trimmedQuery.includes(pattern)) {
        throw new Error(`Query contains potentially dangerous operation: ${pattern}`)
      }
    }
    
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection()
    
    // Add LIMIT if not present and limit is reasonable
    let finalQuery = query
    if (!trimmedQuery.includes('limit') && limit <= 1000) {
      finalQuery = `${query} LIMIT ${limit}`
    }
    
    const result = await connection.query(finalQuery)
    
    return {
      query: finalQuery,
      database_type: connection.type,
      rows_returned: result.data?.length || 0,
      affected_rows: result.affected || 0,
      data: result.data || [],
      execution_time: Date.now(), // Simple timestamp
      timestamp: new Date().toISOString(),
      safety_checks_passed: true
    }
  } catch (error) {
    console.error('Query execution error:', error)
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Analyze table data with common analytics patterns
 */
export async function analyzeTableData(options: AnalysisOptions) {
  const { table_name, analysis_type, date_column, group_by } = options
  
  try {
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection()
    
    switch (analysis_type) {
      case 'summary':
        // Get basic table statistics
        const countResult = await connection.query(`SELECT COUNT(*) as total_rows FROM \`${table_name}\``)
        const totalRows = countResult.data?.[0]?.total_rows || 0
        
        // Get column info
        const columnsResult = await connection.query(`DESCRIBE \`${table_name}\``)
        const columns = columnsResult.data || []
        
        return {
          analysis_type: 'summary',
          table_name,
          total_rows: totalRows,
          total_columns: columns.length,
          columns: columns.map(col => ({
            name: col.Field,
            type: col.Type,
            nullable: col.Null === 'YES'
          })),
          timestamp: new Date().toISOString()
        }
        
      case 'trends':
        if (!date_column) {
          throw new Error('date_column is required for trend analysis')
        }
        
        const trendsResult = await connection.query(`
          SELECT 
            DATE(\`${date_column}\`) as date,
            COUNT(*) as count
          FROM \`${table_name}\`
          WHERE \`${date_column}\` >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY DATE(\`${date_column}\`)
          ORDER BY date DESC
          LIMIT 30
        `)
        
        return {
          analysis_type: 'trends',
          table_name,
          date_column,
          period: 'last_30_days',
          trends: trendsResult.data || [],
          data_points: trendsResult.data?.length || 0,
          timestamp: new Date().toISOString()
        }
        
      case 'distribution':
        if (!group_by) {
          throw new Error('group_by column is required for distribution analysis')
        }
        
        const distributionResult = await connection.query(`
          SELECT 
            \`${group_by}\` as category,
            COUNT(*) as count,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM \`${table_name}\`), 2) as percentage
          FROM \`${table_name}\`
          GROUP BY \`${group_by}\`
          ORDER BY count DESC
          LIMIT 20
        `)
        
        return {
          analysis_type: 'distribution',
          table_name,
          group_by_column: group_by,
          distribution: distributionResult.data || [],
          categories: distributionResult.data?.length || 0,
          timestamp: new Date().toISOString()
        }
        
      default:
        throw new Error(`Unknown analysis type: ${analysis_type}`)
    }
  } catch (error) {
    console.error('Data analysis error:', error)
    throw new Error(`Data analysis failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}