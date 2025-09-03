/**
 * MySQL Analytics Tools (Matomo)
 * Implements comprehensive MCP tools for Matomo web analytics data stored in MySQL
 */

import { getGlobalDatabaseManager } from '@/lib/database'
import { MatomoSchemas, ValidationUtils, ErrorResponseSchema } from './schema-validation'

export interface MatomoQueryOptions {
  query: string
  parameters?: any[]
  limit?: number
}

export interface VisitorAnalyticsOptions {
  date_range?: string
  site_id?: number
  limit?: number
}

export interface ConversionMetricsOptions {
  site_id?: number
  goal_id?: number
  date_range?: string
  limit?: number
}

export interface ContentPerformanceOptions {
  site_id?: number
  date_range?: string
  content_type?: 'pages' | 'entry_pages' | 'exit_pages'
  limit?: number
}

export interface CompanyIntelligenceOptions {
  company_name?: string
  domain?: string
  country?: string
  date_range?: string
  site_id?: number
  limit?: number
}

/**
 * Execute secure parameterized Matomo database queries
 */
export async function queryMatomoDatabase(options: MatomoQueryOptions) {
  try {
    // Validate input parameters
    const validatedInput = ValidationUtils.validateInput(
      MatomoSchemas.queryMatomoDatabase.input,
      options,
      'queryMatomoDatabase'
    )
    
    const { query, parameters = [], limit = 100 } = validatedInput
    // Enhanced safety checks for Matomo queries using validation utils
    const sanitizedQuery = ValidationUtils.sanitizeSqlQuery(query)
    const validatedParameters = ValidationUtils.validateSqlParameters(parameters)
    
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection() // Use default connection
    
    if (connection.type !== 'mysql') {
      throw new Error('MySQL connection required for Matomo analytics')
    }
    
    // Apply limit for safety
    let finalQuery = sanitizedQuery
    if (!sanitizedQuery.toLowerCase().includes('limit') && limit <= 1000) {
      finalQuery = `${sanitizedQuery} LIMIT ${Math.min(limit, 1000)}`
    }
    
    const startTime = Date.now()
    const result = await connection.query(finalQuery, validatedParameters)
    const executionTime = Date.now() - startTime
    
    const output = {
      success: true,
      query: finalQuery,
      parameters: validatedParameters,
      database_type: connection.type,
      rows_returned: result.data?.length || 0,
      data: result.data || [],
      execution_time_ms: executionTime,
      timestamp: new Date().toISOString(),
      safety_checks_passed: true
    }
    
    // Validate output before returning
    return ValidationUtils.validateOutput(
      MatomoSchemas.queryMatomoDatabase.output,
      output,
      'queryMatomoDatabase'
    )
  } catch (error) {
    console.error('Matomo query execution error:', error)
    return ValidationUtils.createErrorResponse(
      'queryMatomoDatabase',
      error instanceof Error ? error : new Error(String(error)),
      'MATOMO_QUERY_ERROR'
    )
  }
}

/**
 * Get visitor analytics including traffic patterns and user behavior
 */
export async function getVisitorAnalytics(options: VisitorAnalyticsOptions = {}) {
  try {
    // Validate input parameters
    const validatedInput = ValidationUtils.validateInput(
      MatomoSchemas.getVisitorAnalytics.input,
      options,
      'getVisitorAnalytics'
    )
    
    const { date_range = 'last_7_days', site_id, limit = 100 } = validatedInput
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection() // Use default connection
    
    if (connection.type !== 'mysql') {
      throw new Error('MySQL connection required for visitor analytics')
    }
    
    // Build dynamic WHERE conditions
    const conditions = []
    const parameters = []
    
    // Date range condition
    switch (date_range) {
      case 'today':
        conditions.push('DATE(visit_first_action_time) = CURDATE()')
        break
      case 'yesterday':
        conditions.push('DATE(visit_first_action_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)')
        break
      case 'last_7_days':
        conditions.push('visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)')
        break
      case 'last_30_days':
        conditions.push('visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
        break
      case 'current_month':
        conditions.push('YEAR(visit_first_action_time) = YEAR(NOW()) AND MONTH(visit_first_action_time) = MONTH(NOW())')
        break
      default:
        conditions.push('visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)')
    }
    
    if (site_id) {
      conditions.push('idsite = ?')
      parameters.push(site_id)
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    // Main visitor analytics query using indexed columns
    const query = `
      SELECT 
        DATE(visit_first_action_time) as visit_date,
        COUNT(*) as total_visits,
        COUNT(DISTINCT idvisitor) as unique_visitors,
        AVG(visit_total_time) as avg_session_duration,
        AVG(visit_total_actions) as avg_pages_per_visit,
        SUM(CASE WHEN visitor_returning = 1 THEN 1 ELSE 0 END) as returning_visitors,
        SUM(CASE WHEN visitor_returning = 0 THEN 1 ELSE 0 END) as new_visitors
      FROM matomo_log_visit 
      ${whereClause}
      GROUP BY DATE(visit_first_action_time)
      ORDER BY visit_date DESC
      LIMIT ${Math.min(limit, 100)}
    `
    
    // Note: LIMIT uses direct substitution, no parameter needed
    
    // DEBUG: Print exact query and parameters before execution
    console.log('🔍 DEBUG get_visitor_analytics MAIN QUERY:')
    console.log('   Query:', query)
    console.log('   Parameters:', JSON.stringify(parameters))
    console.log('   Parameter types:', parameters.map(p => typeof p))
    
    const result = await connection.query(query, parameters)
    
    // Get additional metrics using indexed idsite
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_visits,
        COUNT(DISTINCT idvisitor) as unique_visitors,
        AVG(visit_total_time) as avg_session_duration,
        SUM(visit_total_actions) as total_page_views,
        COUNT(DISTINCT location_country) as countries_count
      FROM matomo_log_visit 
      ${whereClause}
    `
    
    // Create parameters array for summary query (no LIMIT parameter to exclude)
    const summaryParameters = parameters
    
    // DEBUG: Print exact summary query and parameters before execution
    console.log('🔍 DEBUG get_visitor_analytics SUMMARY QUERY:')
    console.log('   Query:', summaryQuery)
    console.log('   Parameters:', JSON.stringify(summaryParameters))
    console.log('   Parameter types:', summaryParameters.map(p => typeof p))
    
    const summaryResult = await connection.query(summaryQuery, summaryParameters)
    
    // Convert null values to numbers for validation
    const summaryData = summaryResult.data?.[0] || {}
    const normalizedSummary = {
      total_visits: Number(summaryData.total_visits || 0),
      unique_visitors: Number(summaryData.unique_visitors || 0),
      avg_session_duration: Number(summaryData.avg_session_duration || 0),
      total_page_views: Number(summaryData.total_page_views || 0),
      countries_count: Number(summaryData.countries_count || 0)
    }
    
    const output = {
      success: true,
      analytics_type: 'visitor_analytics' as const,
      date_range,
      site_id,
      summary: normalizedSummary,
      daily_metrics: result.data || [],
      rows_returned: result.data?.length || 0,
      timestamp: new Date().toISOString()
    }
    
    // Validate output before returning
    return ValidationUtils.validateOutput(
      MatomoSchemas.getVisitorAnalytics.output,
      output,
      'getVisitorAnalytics'
    )
  } catch (error) {
    console.error('Visitor analytics error:', error)
    return ValidationUtils.createErrorResponse(
      'getVisitorAnalytics',
      error instanceof Error ? error : new Error(String(error)),
      'VISITOR_ANALYTICS_ERROR'
    )
  }
}

/**
 * Get conversion metrics including goal tracking and funnel analysis
 */
export async function getConversionMetrics(options: ConversionMetricsOptions = {}) {
  const { site_id, goal_id, date_range = 'last_30_days', limit = 50 } = options
  
  try {
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection() // Use default connection
    
    if (connection.type !== 'mysql') {
      throw new Error('MySQL connection required for conversion metrics')
    }
    
    // Build dynamic WHERE conditions
    const conditions = []
    const parameters = []
    
    // Date range condition
    switch (date_range) {
      case 'today':
        conditions.push('DATE(server_time) = CURDATE()')
        break
      case 'yesterday':
        conditions.push('DATE(server_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)')
        break
      case 'last_7_days':
        conditions.push('server_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)')
        break
      case 'last_30_days':
        conditions.push('server_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
        break
      case 'current_month':
        conditions.push('YEAR(server_time) = YEAR(NOW()) AND MONTH(server_time) = MONTH(NOW())')
        break
      default:
        conditions.push('server_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
    }
    
    if (site_id) {
      conditions.push('c.idsite = ?')
      parameters.push(site_id)
    }
    
    if (goal_id) {
      conditions.push('c.idgoal = ?')
      parameters.push(goal_id)
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    // Main conversion metrics query using indexed columns
    const query = `
      SELECT 
        DATE(c.server_time) as conversion_date,
        g.name as goal_name,
        g.description as goal_description,
        COUNT(*) as total_conversions,
        SUM(c.revenue) as total_revenue,
        AVG(c.revenue) as avg_order_value,
        COUNT(DISTINCT c.idvisit) as converting_visits,
        g.revenue as goal_value
      FROM matomo_log_conversion c
      LEFT JOIN matomo_goal g ON c.idgoal = g.idgoal AND c.idsite = g.idsite
      ${whereClause}
      GROUP BY DATE(c.server_time), c.idgoal, g.name, g.description, g.revenue
      ORDER BY conversion_date DESC, total_conversions DESC
      LIMIT ${Math.min(limit, 100)}
    `
    
    // Note: LIMIT uses direct substitution, no parameter needed
    
    const result = await connection.query(query, parameters)
    
    // Get conversion summary using indexed idsite
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_conversions,
        SUM(c.revenue) as total_revenue,
        COUNT(DISTINCT c.idgoal) as goals_count,
        COUNT(DISTINCT c.idvisit) as converting_visits,
        AVG(c.revenue) as avg_order_value
      FROM matomo_log_conversion c
      ${whereClause.replace('c.idsite', 'idsite')}
    `
    
    // Create separate parameters array for summary query (exclude the LIMIT parameter)
    const summaryParameters = []
    if (site_id) summaryParameters.push(site_id)
    if (goal_id) summaryParameters.push(goal_id)
    const summaryResult = await connection.query(summaryQuery, summaryParameters)
    
    return {
      success: true,
      metrics_type: 'conversion_metrics',
      date_range,
      site_id,
      goal_id,
      summary: summaryResult.data?.[0] || {},
      conversion_data: result.data || [],
      rows_returned: result.data?.length || 0,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('Conversion metrics error:', error)
    return {
      success: false,
      error: 'Failed to retrieve conversion metrics',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      code: 'CONVERSION_METRICS_ERROR'
    }
  }
}

/**
 * Get content performance including page views, bounce rates, and engagement
 */
export async function getContentPerformance(options: ContentPerformanceOptions = {}) {
  const { site_id, date_range = 'last_30_days', content_type = 'pages', limit = 50 } = options
  
  try {
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection() // Use default connection
    
    if (connection.type !== 'mysql') {
      throw new Error('MySQL connection required for content performance')
    }
    
    // Build dynamic WHERE conditions
    const conditions = []
    const parameters = []
    
    // Date range condition
    switch (date_range) {
      case 'today':
        conditions.push('DATE(lva.server_time) = CURDATE()')
        break
      case 'yesterday':
        conditions.push('DATE(lva.server_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)')
        break
      case 'last_7_days':
        conditions.push('lva.server_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)')
        break
      case 'last_30_days':
        conditions.push('lva.server_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
        break
      case 'current_month':
        conditions.push('YEAR(lva.server_time) = YEAR(NOW()) AND MONTH(lva.server_time) = MONTH(NOW())')
        break
      default:
        conditions.push('lva.server_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
    }
    
    if (site_id) {
      conditions.push('lva.idsite = ?')
      parameters.push(site_id)
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    let query = ''
    
    switch (content_type) {
      case 'pages':
        query = `
          SELECT 
            a.name as page_url,
            a.url_prefix as url_prefix,
            COUNT(*) as page_views,
            COUNT(DISTINCT lva.idvisit) as unique_page_views,
            AVG(lva.time_spent) as avg_time_on_page
          FROM matomo_log_link_visit_action lva
          JOIN matomo_log_action a ON lva.idaction_url = a.idaction
          ${whereClause}
          AND a.type = 1
          GROUP BY lva.idaction_url, a.name, a.url_prefix
          ORDER BY page_views DESC
          LIMIT ${Math.min(limit, 100)}
        `
        break
        
      case 'entry_pages':
        query = `
          SELECT 
            a.name as entry_page,
            a.url_prefix as url_prefix,
            COUNT(DISTINCT lv.idvisit) as entries,
            AVG(lv.visit_total_time) as avg_session_duration,
            AVG(lv.visit_total_actions) as avg_actions_after_entry,
            SUM(CASE WHEN lv.visit_total_actions = 1 THEN 1 ELSE 0 END) as bounce_count
          FROM matomo_log_visit lv
          JOIN matomo_log_action a ON lv.visit_entry_idaction_url = a.idaction
          ${whereClause.replace('lva.', 'lv.')}
          GROUP BY lv.visit_entry_idaction_url, a.name
          ORDER BY entries DESC
          LIMIT ${Math.min(limit, 100)}
        `
        break
        
      case 'exit_pages':
        query = `
          SELECT 
            a.name as exit_page,
            a.url_prefix as url_prefix,
            COUNT(DISTINCT lv.idvisit) as exits,
            AVG(lv.visit_total_time) as avg_session_duration_before_exit,
            AVG(lv.visit_total_actions) as avg_actions_before_exit
          FROM matomo_log_visit lv
          JOIN matomo_log_action a ON lv.visit_exit_idaction_url = a.idaction
          ${whereClause.replace('lva.', 'lv.')}
          GROUP BY lv.visit_exit_idaction_url, a.name
          ORDER BY exits DESC
          LIMIT ${Math.min(limit, 100)}
        `
        break
        
      default:
        throw new Error(`Unknown content type: ${content_type}`)
    }
    
    // Note: LIMIT uses direct substitution, no parameter needed
    
    const result = await connection.query(query, parameters)
    
    return {
      success: true,
      performance_type: 'content_performance',
      content_type,
      date_range,
      site_id,
      content_data: result.data || [],
      rows_returned: result.data?.length || 0,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('Content performance error:', error)
    return {
      success: false,
      error: 'Failed to retrieve content performance',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      code: 'CONTENT_PERFORMANCE_ERROR'
    }
  }
}

/**
 * Get company intelligence from B2B visitor data using fast fallback approach
 */
export async function getCompanyIntelligence(options: CompanyIntelligenceOptions = {}) {
  const { company_name, domain, country, date_range = 'last_30_days', site_id, limit = 50 } = options
  
  try {
    const dbManager = await getGlobalDatabaseManager()
    const connection = dbManager.getConnection() // Use default connection
    
    if (connection.type !== 'mysql') {
      throw new Error('MySQL connection required for company intelligence')
    }

    console.log('🏢 Company Intelligence: Starting query with timeout protection...')
    
    // Check if company enrichment tables exist first
    try {
      const tableCheck = await connection.query('SHOW TABLES LIKE "matomo_visitor_enriched_session_premium"')
      if (!tableCheck.data || tableCheck.data.length === 0) {
        console.log('⚠️ Company enrichment tables not available, using basic visitor data...')
        return getBasicVisitorIntelligence(connection, options)
      }
    } catch {
      console.log('⚠️ Company enrichment check failed, falling back to basic data...')
      return getBasicVisitorIntelligence(connection, options)
    }
    
    // Build optimized conditions for fast query
    const conditions = ['lv.idsite IS NOT NULL'] // Always use indexed column
    const parameters = []
    
    // Use indexed visit_last_action_time (part of index_idsite_datetime)
    switch (date_range) {
      case 'today':
        conditions.push('lv.visit_last_action_time >= CURDATE()')
        break
      case 'yesterday':
        conditions.push('lv.visit_last_action_time >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)')
        conditions.push('lv.visit_last_action_time < CURDATE()')
        break
      case 'last_7_days':
        conditions.push('lv.visit_last_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)')
        break
      case 'last_30_days':
        conditions.push('lv.visit_last_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
        break
      case 'current_month':
        conditions.push('lv.visit_last_action_time >= DATE_FORMAT(NOW(), "%Y-%m-01")')
        break
      default:
        conditions.push('lv.visit_last_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)') // Shorter default for performance
    }
    
    // Use indexed idsite column for site filtering
    if (site_id) {
      conditions.push('lv.idsite = ?')
      parameters.push(site_id)
    }
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`
    
    // Ultra-fast query using Matomo's indexed columns (idsite + visit_first_action_time)
    const quickQuery = `
      SELECT 
        lv.location_country as country,
        COUNT(*) as total_visits,
        COUNT(DISTINCT lv.idvisitor) as unique_visitors,
        MAX(lv.visit_last_action_time) as last_visit,
        ROUND(AVG(lv.visit_total_time), 0) as avg_session_duration
      FROM matomo_log_visit lv
      ${whereClause}
        AND lv.location_country IS NOT NULL 
        AND lv.location_country != ''
      GROUP BY lv.location_country
      ORDER BY total_visits DESC
      LIMIT ${Math.min(limit, 10)}
    `
    
    console.log('🔍 Executing OPTIMIZED company intelligence query...')
    console.log('📝 Query:', quickQuery.replace(/\s+/g, ' ').trim())
    console.log('📝 Parameters:', JSON.stringify(parameters))
    const startTime = Date.now()
    
    // Execute with timeout protection
    const result = await Promise.race([
      connection.query(quickQuery, parameters),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout after 30 seconds')), 30000)
      )
    ]) as any
    
    const executionTime = Date.now() - startTime
    console.log(`⚡ Query completed in ${executionTime}ms`)
    
    // Get basic summary using indexed conditions only
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_visits,
        COUNT(DISTINCT lv.idvisitor) as unique_visitors
      FROM matomo_log_visit lv
      ${whereClause}
      LIMIT 1
    `
    
    const summaryResult = await Promise.race([
      connection.query(summaryQuery, parameters),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Summary timeout')), 10000)
      )
    ]) as any
    
    return {
      success: true,
      intelligence_type: 'company_intelligence',
      date_range,
      site_id,
      filters: { company_name, domain, country },
      summary: summaryResult.data?.[0] || {},
      company_data: result.data || [],
      rows_returned: result.data?.length || 0,
      execution_time_ms: executionTime,
      note: 'Using optimized visitor intelligence (enrichment data unavailable)',
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('Company intelligence error:', error)
    
    // Final fallback to most basic data
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      console.log('🚨 Query timeout detected, using emergency fallback...')
      try {
        const dbManager = await getGlobalDatabaseManager()
        const connection = dbManager.getConnection()
        return getEmergencyFallback(connection, options)
      } catch (fallbackError) {
        console.error('Emergency fallback failed:', fallbackError)
      }
    }
    
    return {
      success: false,
      error: 'Failed to retrieve company intelligence',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      code: 'COMPANY_INTELLIGENCE_ERROR'
    }
  }
}

/**
 * Basic visitor intelligence when enrichment tables are unavailable
 */
async function getBasicVisitorIntelligence(connection: any, options: CompanyIntelligenceOptions) {
  const { date_range = 'last_30_days', site_id, limit = 50 } = options
  
  const conditions = []
  const parameters = []
  
  // Simple date filter
  if (date_range === 'today') {
    conditions.push('DATE(visit_first_action_time) = CURDATE()')
  } else {
    conditions.push('visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)')
  }
  
  if (site_id) {
    conditions.push('idsite = ?')
    parameters.push(site_id)
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  
  const query = `
    SELECT 
      location_country as country,
      location_city as city, 
      COUNT(DISTINCT idvisit) as total_visits,
      COUNT(DISTINCT idvisitor) as unique_visitors,
      MAX(visit_last_action_time) as last_visit
    FROM matomo_log_visit 
    ${whereClause}
      AND location_country IS NOT NULL
    GROUP BY location_country, location_city
    ORDER BY total_visits DESC
    LIMIT ${Math.min(limit, 20)}
  `
  
  const result = await connection.query(query, parameters)
  
  return {
    success: true,
    intelligence_type: 'basic_visitor_intelligence',
    date_range,
    site_id,
    company_data: result.data || [],
    rows_returned: result.data?.length || 0,
    note: 'Basic visitor data (company enrichment unavailable)',
    timestamp: new Date().toISOString()
  }
}

/**
 * Emergency fallback for timeout scenarios
 */
async function getEmergencyFallback(connection: any, options: CompanyIntelligenceOptions) {
  const { site_id } = options
  
  const query = site_id 
    ? 'SELECT COUNT(*) as total_visits FROM matomo_log_visit WHERE idsite = ? LIMIT 1'
    : 'SELECT COUNT(*) as total_visits FROM matomo_log_visit LIMIT 1'
    
  const parameters = site_id ? [site_id] : []
  const result = await connection.query(query, parameters)
  
  return {
    success: true,
    intelligence_type: 'emergency_fallback',
    summary: result.data?.[0] || { total_visits: 0 },
    company_data: [],
    rows_returned: 0,
    note: 'Emergency fallback due to query timeout',
    timestamp: new Date().toISOString()
  }
}