/**
 * Cross-Database Query Tools
 * Combines and correlates data from Neo4j (industrial) and MySQL (analytics) databases
 */

import { getGlobalDatabaseManager } from '@/lib/database'

export interface UnifiedDashboardOptions {
  company_name?: string
  date_range?: string
  site_id?: number
  include_web_analytics?: boolean
  include_operational_data?: boolean
  limit?: number
}

export interface OperationalCorrelationOptions {
  entity_type?: 'Machine' | 'Process' | 'Service' | 'Company' | 'Location'
  entity_name?: string
  website_domain?: string
  date_range?: string
  correlation_type?: 'visitor_to_entity' | 'company_to_operations' | 'geographic_correlation'
  limit?: number
}

/**
 * Get unified dashboard data combining metrics from both databases
 */
export async function getUnifiedDashboardData(options: UnifiedDashboardOptions = {}) {
  const { 
    company_name, 
    date_range = 'last_30_days', 
    site_id,
    include_web_analytics = true,
    include_operational_data = true,
    limit = 50 
  } = options
  
  try {
    const dbManager = await getGlobalDatabaseManager()
    const results: any = {
      success: true,
      dashboard_type: 'unified_dashboard',
      date_range,
      company_name,
      timestamp: new Date().toISOString(),
      data_sources: []
    }

    // Get web analytics data from MySQL (Matomo)
    if (include_web_analytics) {
      try {
        const mysqlConnection = dbManager.getConnection() // Use default connection
        if (mysqlConnection.type === 'mysql') {
          results.data_sources.push('mysql_analytics')
          
          // Build conditions for analytics query
          const conditions = []
          const parameters = []
          
          // Date range condition
          switch (date_range) {
            case 'today':
              conditions.push('DATE(lv.visit_first_action_time) = CURDATE()')
              break
            case 'yesterday':
              conditions.push('DATE(lv.visit_first_action_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)')
              break
            case 'last_7_days':
              conditions.push('lv.visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)')
              break
            case 'last_30_days':
              conditions.push('lv.visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
              break
            default:
              conditions.push('lv.visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)')
          }
          
          if (site_id) {
            conditions.push('lv.idsite = ?')
            parameters.push(site_id)
          }
          
          const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
          
          // Get web analytics summary
          const analyticsQuery = `
            SELECT 
              COUNT(*) as total_visits,
              COUNT(DISTINCT lv.idvisitor) as unique_visitors,
              AVG(lv.visit_total_time) as avg_session_duration,
              SUM(lv.visit_total_actions) as total_page_views,
              COUNT(DISTINCT lv.location_country) as countries_reached,
              COUNT(DISTINCT DATE(lv.visit_first_action_time)) as active_days
            FROM matomo_log_visit lv
            ${whereClause}
          `
          
          const analyticsResult = await mysqlConnection.query(analyticsQuery, parameters)
          results.web_analytics = analyticsResult.data?.[0] || {}
          
          // Get company intelligence if company_name provided
          if (company_name) {
            const companyQuery = `
              SELECT 
                vesp.companyName as company_name,
                vesp.companyUrl as website,
                JSON_EXTRACT(vesp.geo, '$.country') as country,
                JSON_EXTRACT(vesp.companyDetails, '$.industry') as industry,
                JSON_EXTRACT(vesp.companyDetails, '$.size') as company_size,
                COUNT(DISTINCT lv.idvisit) as total_visits,
                MAX(lv.visit_last_action_time) as last_visit,
                AVG(lv.visit_total_time) as avg_session_duration
              FROM matomo_log_visit lv
              JOIN matomo_visitor_ip_map vim ON lv.location_ip = vim.visitorip 
                AND lv.idsite = vim.idsite
              JOIN matomo_visitor_enriched_session_premium vesp ON vim.visitorip = vesp.ip
              ${whereClause}
              AND vesp.company = 1
              AND vesp.companyName LIKE ?
              GROUP BY vesp.companyName, vesp.companyUrl
              ORDER BY total_visits DESC
              LIMIT ?
            `
            
            const companyParams = [...parameters, `%${company_name}%`, parseInt(Math.min(limit, 20).toString(), 10)]
            const companyResult = await mysqlConnection.query(companyQuery, companyParams)
            results.company_analytics = companyResult.data || []
          }
        }
      } catch (error) {
        console.error('MySQL analytics error in unified dashboard:', error)
        results.web_analytics_error = error instanceof Error ? error.message : String(error)
      }
    }

    // Get operational data from Neo4j
    if (include_operational_data) {
      try {
        const neo4jConnection = dbManager.getConnection('neo4j')
        if (neo4jConnection.type === 'neo4j') {
          results.data_sources.push('neo4j_operational')
          
          // Get organizational overview
          const orgQuery = company_name 
            ? `
              MATCH (c:Company)
              OPTIONAL MATCH (c)-[:HAS_LOCATION]->(l:Location)
              OPTIONAL MATCH (c)-[:OPERATES]->(m:Machine)
              OPTIONAL MATCH (c)-[:RUNS]->(p:Process)
              OPTIONAL MATCH (c)-[:PROVIDES]->(s:Service)
              WHERE c.name CONTAINS $param0
              RETURN 
                c.name as company_name,
                c.industry as industry,
                c.size as company_size,
                count(DISTINCT l) as locations_count,
                count(DISTINCT m) as machines_count,
                count(DISTINCT p) as processes_count,
                count(DISTINCT s) as services_count
              ORDER BY company_name
              LIMIT $param1
            `
            : `
              MATCH (c:Company)
              OPTIONAL MATCH (c)-[:HAS_LOCATION]->(l:Location)
              OPTIONAL MATCH (c)-[:OPERATES]->(m:Machine)
              OPTIONAL MATCH (c)-[:RUNS]->(p:Process)
              OPTIONAL MATCH (c)-[:PROVIDES]->(s:Service)
              RETURN 
                c.name as company_name,
                c.industry as industry,
                c.size as company_size,
                count(DISTINCT l) as locations_count,
                count(DISTINCT m) as machines_count,
                count(DISTINCT p) as processes_count,
                count(DISTINCT s) as services_count
              ORDER BY company_name
              LIMIT $param0
            `
          
          const orgParams = company_name 
            ? [company_name, parseInt(Math.min(limit, 20).toString(), 10)]
            : [parseInt(Math.min(limit, 20).toString(), 10)]
          
          const orgResult = await neo4jConnection.query(orgQuery, orgParams)
          results.operational_data = orgResult.data || []
          
          // Get capability overview
          const capabilityQuery = company_name
            ? `
              MATCH (c:Company)-[:EMPLOYS]->(e:Employee)-[:HAS_SKILL]->(sk:Skill)
              WHERE c.name CONTAINS $param0
              RETURN 
                c.name as company_name,
                collect(DISTINCT sk.name)[0..5] as top_skills,
                count(DISTINCT e) as employees_count,
                count(DISTINCT sk) as skills_count
              ORDER BY skills_count DESC
              LIMIT $param1
            `
            : `
              MATCH (c:Company)-[:EMPLOYS]->(e:Employee)-[:HAS_SKILL]->(sk:Skill)
              RETURN 
                c.name as company_name,
                collect(DISTINCT sk.name)[0..5] as top_skills,
                count(DISTINCT e) as employees_count,
                count(DISTINCT sk) as skills_count
              ORDER BY skills_count DESC
              LIMIT $param0
            `
          
          const capabilityResult = await neo4jConnection.query(capabilityQuery, orgParams)
          results.capability_data = capabilityResult.data || []
        }
      } catch (error) {
        console.error('Neo4j operational error in unified dashboard:', error)
        results.operational_data_error = error instanceof Error ? error.message : String(error)
      }
    }

    // Calculate cross-database correlations if both data sources available
    if (results.web_analytics && results.operational_data && results.operational_data.length > 0) {
      results.correlations = {
        companies_with_both_data: 0,
        web_to_operational_ratio: 0,
        data_correlation_strength: 'low'
      }
      
      // Find companies present in both datasets
      if (results.company_analytics && results.company_analytics.length > 0) {
        const webCompanies = new Set(results.company_analytics.map((c: any) => c.company_name?.toLowerCase()))
        const opCompanies = new Set(results.operational_data.map((c: any) => c.company_name?.toLowerCase()))
        
        const intersection = new Set(Array.from(webCompanies).filter(x => opCompanies.has(x)))
        results.correlations.companies_with_both_data = intersection.size
        
        if (webCompanies.size > 0 && opCompanies.size > 0) {
          results.correlations.web_to_operational_ratio = intersection.size / Math.max(webCompanies.size, opCompanies.size)
          
          if (results.correlations.web_to_operational_ratio > 0.7) {
            results.correlations.data_correlation_strength = 'high'
          } else if (results.correlations.web_to_operational_ratio > 0.3) {
            results.correlations.data_correlation_strength = 'medium'
          }
        }
      }
    }

    return results
  } catch (error) {
    console.error('Unified dashboard error:', error)
    return {
      success: false,
      error: 'Failed to retrieve unified dashboard data',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      code: 'UNIFIED_DASHBOARD_ERROR'
    }
  }
}

/**
 * Correlate operational relationships with web analytics data
 */
export async function correlateOperationalRelationships(options: OperationalCorrelationOptions = {}) {
  const { 
    entity_type = 'Company',
    entity_name,
    website_domain,
    date_range = 'last_30_days',
    correlation_type = 'company_to_operations',
    limit = 30
  } = options
  
  try {
    const dbManager = await getGlobalDatabaseManager()
    const results: any = {
      success: true,
      correlation_type,
      entity_type,
      entity_name,
      website_domain,
      date_range,
      timestamp: new Date().toISOString(),
      correlations: []
    }

    switch (correlation_type) {
      case 'company_to_operations':
        // Find companies in Neo4j and correlate with web analytics
        const neo4jConnection = dbManager.getConnection('neo4j')
        if (neo4jConnection.type === 'neo4j') {
          const companyQuery = entity_name
            ? `
              MATCH (c:Company)
              OPTIONAL MATCH (c)-[:HAS_LOCATION]->(l:Location)
              OPTIONAL MATCH (c)-[:OPERATES]->(m:Machine)
              OPTIONAL MATCH (c)-[:RUNS]->(p:Process)
              OPTIONAL MATCH (c)-[:PROVIDES]->(s:Service)
              OPTIONAL MATCH (c)-[:EMPLOYS]->(e:Employee)
              WHERE c.name CONTAINS $param0
              RETURN 
                c.name as company_name,
                c.website as company_website,
                c.industry as industry,
                c.location as headquarters_location,
                count(DISTINCT l) as locations,
                count(DISTINCT m) as machines,
                count(DISTINCT p) as processes,
                count(DISTINCT s) as services,
                count(DISTINCT e) as employees
              ORDER BY c.name
              LIMIT $param1
            `
            : `
              MATCH (c:Company)
              OPTIONAL MATCH (c)-[:HAS_LOCATION]->(l:Location)
              OPTIONAL MATCH (c)-[:OPERATES]->(m:Machine)
              OPTIONAL MATCH (c)-[:RUNS]->(p:Process)
              OPTIONAL MATCH (c)-[:PROVIDES]->(s:Service)
              OPTIONAL MATCH (c)-[:EMPLOYS]->(e:Employee)
              RETURN 
                c.name as company_name,
                c.website as company_website,
                c.industry as industry,
                c.location as headquarters_location,
                count(DISTINCT l) as locations,
                count(DISTINCT m) as machines,
                count(DISTINCT p) as processes,
                count(DISTINCT s) as services,
                count(DISTINCT e) as employees
              ORDER BY c.name
              LIMIT $param0
            `
          
          const companyParams = entity_name 
            ? [entity_name, parseInt(Math.min(limit, 50).toString(), 10)]
            : [parseInt(Math.min(limit, 50).toString(), 10)]
          
          const companyResult = await neo4jConnection.query(companyQuery, companyParams)
          
          // For each company found, try to get web analytics data
          const mysqlConnection = dbManager.getConnection() // Use default connection
          if (mysqlConnection.type === 'mysql' && companyResult.data) {
            for (const company of companyResult.data) {
              try {
                // Build date condition
                const dateCondition = date_range === 'last_7_days' 
                  ? 'lv.visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
                  : 'lv.visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
                
                const webQuery = `
                  SELECT 
                    COUNT(DISTINCT lv.idvisit) as total_visits,
                    COUNT(DISTINCT lv.idvisitor) as unique_visitors,
                    AVG(lv.visit_total_time) as avg_session_duration,
                    MAX(lv.visit_last_action_time) as last_visit,
                    COUNT(DISTINCT lv.location_country) as countries
                  FROM matomo_log_visit lv
                  JOIN matomo_visitor_ip_map vim ON lv.location_ip = vim.visitorip 
                    AND lv.idsite = vim.idsite
                  JOIN matomo_visitor_enriched_session_premium vesp ON vim.visitorip = vesp.ip
                  WHERE ${dateCondition}
                  AND vesp.company = 1
                  AND (vesp.companyName LIKE ? OR vesp.companyUrl LIKE ?)
                `
                
                const webParams = [`%${company.company_name}%`, `%${company.company_website || ''}%`]
                const webResult = await mysqlConnection.query(webQuery, webParams)
                
                const correlation = {
                  ...company,
                  web_analytics: webResult.data?.[0] || {
                    total_visits: 0,
                    unique_visitors: 0,
                    avg_session_duration: 0,
                    last_visit: null,
                    countries: 0
                  },
                  correlation_strength: 'none'
                }
                
                // Determine correlation strength
                const visits = correlation.web_analytics.total_visits || 0
                if (visits > 100) {
                  correlation.correlation_strength = 'high'
                } else if (visits > 10) {
                  correlation.correlation_strength = 'medium'
                } else if (visits > 0) {
                  correlation.correlation_strength = 'low'
                }
                
                results.correlations.push(correlation)
              } catch (webError) {
                console.error(`Web analytics error for company ${company.company_name}:`, webError)
                results.correlations.push({
                  ...company,
                  web_analytics_error: webError instanceof Error ? webError.message : String(webError)
                })
              }
            }
          }
        }
        break
        
      case 'geographic_correlation':
        // Correlate geographic data between databases
        const geoResults = await correlateGeographicData(dbManager, { date_range, limit })
        results.correlations = geoResults.correlations || []
        break
        
      case 'visitor_to_entity':
        // Find visitors that might be related to operational entities
        if (website_domain) {
          const visitorResults = await correlateVisitorToEntity(dbManager, { website_domain, date_range, limit })
          results.correlations = visitorResults.correlations || []
        }
        break
        
      default:
        throw new Error(`Unknown correlation type: ${correlation_type}`)
    }

    return results
  } catch (error) {
    console.error('Operational correlation error:', error)
    return {
      success: false,
      error: 'Failed to correlate operational relationships',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      code: 'OPERATIONAL_CORRELATION_ERROR'
    }
  }
}

/**
 * Helper function to correlate geographic data
 */
async function correlateGeographicData(dbManager: any, options: { date_range: string; limit: number }) {
  try {
    // Get geographic distribution from Neo4j
    const neo4jConnection = dbManager.getConnection('neo4j')
    const locationQuery = `
      MATCH (l:Location)
      OPTIONAL MATCH (l)<-[:HAS_LOCATION]-(c:Company)
      RETURN 
        l.country as country,
        l.city as city,
        count(DISTINCT c) as companies_count
      ORDER BY companies_count DESC
      LIMIT $param0
    `
    
    const locationResult = await neo4jConnection.query(locationQuery, [parseInt(options.limit.toString(), 10)])
    
    // Get geographic distribution from MySQL (Matomo)
    const mysqlConnection = dbManager.getConnection() // Use default connection
    const dateCondition = options.date_range === 'last_7_days' 
      ? 'visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
      : 'visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    
    const webGeoQuery = `
      SELECT 
        location_country as country,
        location_city as city,
        COUNT(DISTINCT idvisit) as visits,
        COUNT(DISTINCT idvisitor) as unique_visitors
      FROM matomo_log_visit 
      WHERE ${dateCondition}
      AND location_country IS NOT NULL
      GROUP BY location_country, location_city
      ORDER BY visits DESC
      LIMIT ?
    `
    
    const webGeoResult = await mysqlConnection.query(webGeoQuery, [options.limit])
    
    // Correlate the data
    const correlations = []
    const webGeoMap = new Map()
    
    if (webGeoResult.data) {
      for (const row of webGeoResult.data) {
        const key = `${row.country}-${row.city || 'Unknown'}`
        webGeoMap.set(key, row)
      }
    }
    
    if (locationResult.data) {
      for (const location of locationResult.data) {
        const key = `${location.country}-${location.city || 'Unknown'}`
        const webData = webGeoMap.get(key)
        
        correlations.push({
          country: location.country,
          city: location.city,
          operational_companies: location.companies_count || 0,
          web_visits: webData?.visits || 0,
          web_visitors: webData?.unique_visitors || 0,
          correlation_exists: !!webData
        })
      }
    }
    
    return { correlations }
  } catch (error) {
    console.error('Geographic correlation error:', error)
    return { correlations: [] }
  }
}

/**
 * Helper function to correlate visitors to entities
 */
async function correlateVisitorToEntity(dbManager: any, options: { website_domain: string; date_range: string; limit: number }) {
  try {
    const mysqlConnection = dbManager.getConnection() // Use default connection
    const dateCondition = options.date_range === 'last_7_days' 
      ? 'lv.visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
      : 'lv.visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    
    // Get visitors from specific domain
    const visitorQuery = `
      SELECT 
        vesp.companyName as company_name,
        vesp.companyUrl as company_website,
        JSON_EXTRACT(vesp.geo, '$.country') as country,
        JSON_EXTRACT(vesp.companyDetails, '$.industry') as industry,
        COUNT(DISTINCT lv.idvisit) as visits,
        COUNT(DISTINCT lv.idvisitor) as unique_visitors,
        MAX(lv.visit_last_action_time) as last_visit
      FROM matomo_log_visit lv
      JOIN matomo_visitor_ip_map vim ON lv.location_ip = vim.visitorip 
        AND lv.idsite = vim.idsite
      JOIN matomo_visitor_enriched_session_premium vesp ON vim.visitorip = vesp.ip
      WHERE ${dateCondition}
      AND vesp.company = 1
      AND vesp.companyUrl LIKE ?
      GROUP BY vesp.companyName, vesp.companyUrl
      ORDER BY visits DESC
      LIMIT ?
    `
    
    const visitorParams = [`%${options.website_domain}%`, options.limit]
    const visitorResult = await mysqlConnection.query(visitorQuery, visitorParams)
    
    const correlations = []
    
    if (visitorResult.data) {
      // For each visitor company, try to find operational data
      const neo4jConnection = dbManager.getConnection('neo4j')
      
      for (const visitor of visitorResult.data) {
        try {
          const entityQuery = `
            MATCH (c:Company)
            WHERE c.name CONTAINS $param0 OR c.website CONTAINS $param1
            OPTIONAL MATCH (c)-[:OPERATES]->(m:Machine)
            OPTIONAL MATCH (c)-[:RUNS]->(p:Process)
            OPTIONAL MATCH (c)-[:PROVIDES]->(s:Service)
            RETURN 
              c.name as company_name,
              c.website as website,
              c.industry as industry,
              count(DISTINCT m) as machines,
              count(DISTINCT p) as processes,
              count(DISTINCT s) as services
            LIMIT 1
          `
          
          const entityParams = [
            visitor.company_name || '',
            visitor.company_website || ''
          ]
          
          const entityResult = await neo4jConnection.query(entityQuery, entityParams)
          
          correlations.push({
            visitor_data: visitor,
            operational_data: entityResult.data?.[0] || null,
            has_operational_match: !!entityResult.data?.[0]
          })
        } catch (entityError) {
          console.error(`Entity lookup error for ${visitor.company_name}:`, entityError)
          correlations.push({
            visitor_data: visitor,
            operational_data: null,
            has_operational_match: false,
            error: entityError instanceof Error ? entityError.message : String(entityError)
          })
        }
      }
    }
    
    return { correlations }
  } catch (error) {
    console.error('Visitor to entity correlation error:', error)
    return { correlations: [] }
  }
}