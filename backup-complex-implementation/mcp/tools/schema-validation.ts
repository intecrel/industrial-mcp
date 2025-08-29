/**
 * MCP Tool Schema Validation
 * Comprehensive input/output validation for all MCP tools using Zod schemas
 */

import { z } from 'zod'

// Common validation schemas
export const CommonSchemas = {
  // Date range validation
  dateRange: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'current_month']),
  
  // Positive integer with limits
  positiveLimit: z.number().int().min(1).max(1000),
  
  // Site ID validation
  siteId: z.number().int().min(1),
  
  // SQL injection prevention - basic patterns
  sqlSafeString: z.string().refine(
    (val) => !val.toLowerCase().includes('drop') && 
             !val.toLowerCase().includes('delete') && 
             !val.toLowerCase().includes('update') && 
             !val.toLowerCase().includes('insert') && 
             !val.toLowerCase().includes('alter') && 
             !val.toLowerCase().includes('create') && 
             !val.toLowerCase().includes('truncate') &&
             !val.includes(';') &&
             !val.includes('--') &&
             !val.includes('/*'),
    { message: 'String contains potentially dangerous SQL patterns' }
  ),
  
  // Company name validation
  companyName: z.string().min(1).max(200).regex(/^[a-zA-Z0-9\s\-\.\&]+$/, 'Invalid company name format'),
  
  // Domain validation
  domain: z.string().min(1).max(255).regex(/^[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}$/, 'Invalid domain format'),
  
  // Country code validation (ISO 3166-1 alpha-2)
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/, 'Invalid country code format'),
  
  // Entity types for Neo4j
  entityType: z.enum(['Machine', 'Process', 'Service', 'Company', 'Location', 'Employee', 'Skill']),
  
  // Correlation types
  correlationType: z.enum(['visitor_to_entity', 'company_to_operations', 'geographic_correlation']),
  
  // Analysis types
  analysisType: z.enum(['summary', 'trends', 'distribution']),
  
  // Content types for Matomo
  contentType: z.enum(['pages', 'entry_pages', 'exit_pages'])
}

// Neo4j Knowledge Graph Tool Schemas
export const Neo4jSchemas = {
  queryKnowledgeGraph: {
    input: z.object({
      query: z.string().min(1).max(5000).refine(
        (val) => val.toLowerCase().startsWith('match') || 
                 val.toLowerCase().startsWith('return') ||
                 val.toLowerCase().startsWith('with'),
        { message: 'Query must start with MATCH, RETURN, or WITH' }
      ),
      parameters: z.record(z.any()).optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      query: z.string(),
      parameters: z.record(z.any()).optional(),
      database_type: z.literal('neo4j'),
      rows_returned: z.number().int().min(0),
      data: z.array(z.record(z.any())),
      execution_time_ms: z.number().min(0),
      timestamp: z.string().datetime(),
      safety_checks_passed: z.boolean()
    })
  },
  
  getOrganizationalStructure: {
    input: z.object({
      department: z.string().max(100).optional(),
      depth: z.number().int().min(1).max(10).optional(),
      include_employees: z.boolean().optional()
    }),
    output: z.object({
      success: z.boolean(),
      structure_type: z.literal('organizational_structure'),
      department: z.string().optional(),
      depth: z.number().int(),
      organizational_data: z.array(z.record(z.any())),
      rows_returned: z.number().int().min(0),
      timestamp: z.string().datetime()
    })
  },
  
  findCapabilityPaths: {
    input: z.object({
      skill: z.string().min(1).max(100),
      source_employee: z.string().max(100).optional(),
      target_role: z.string().max(100).optional(),
      max_hops: z.number().int().min(1).max(10).optional()
    }),
    output: z.object({
      success: z.boolean(),
      path_type: z.literal('capability_paths'),
      skill: z.string(),
      source_employee: z.string().optional(),
      target_role: z.string().optional(),
      capability_paths: z.array(z.record(z.any())),
      rows_returned: z.number().int().min(0),
      timestamp: z.string().datetime()
    })
  }
}

// MySQL Analytics (Matomo) Tool Schemas
export const MatomoSchemas = {
  queryMatomoDatabase: {
    input: z.object({
      query: z.string().min(1).max(5000).refine(
        (val) => val.toLowerCase().trim().startsWith('select') &&
                 val.toLowerCase().includes('matomo_'),
        { message: 'Query must be SELECT statement targeting matomo_ tables' }
      ),
      parameters: z.array(z.any()).optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      query: z.string(),
      parameters: z.array(z.any()).optional(),
      database_type: z.literal('mysql'),
      rows_returned: z.number().int().min(0),
      data: z.array(z.record(z.any())),
      execution_time_ms: z.number().min(0),
      timestamp: z.string().datetime(),
      safety_checks_passed: z.boolean()
    })
  },
  
  getVisitorAnalytics: {
    input: z.object({
      date_range: CommonSchemas.dateRange.optional(),
      site_id: CommonSchemas.siteId.optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      analytics_type: z.literal('visitor_analytics'),
      date_range: CommonSchemas.dateRange,
      site_id: CommonSchemas.siteId.optional(),
      summary: z.object({
        total_visits: z.number().int().min(0),
        unique_visitors: z.number().int().min(0),
        avg_session_duration: z.number().min(0),
        total_page_views: z.number().int().min(0),
        countries_count: z.number().int().min(0)
      }),
      daily_metrics: z.array(z.record(z.any())),
      rows_returned: z.number().int().min(0),
      timestamp: z.string().datetime()
    })
  },
  
  getConversionMetrics: {
    input: z.object({
      site_id: CommonSchemas.siteId.optional(),
      goal_id: z.number().int().min(1).optional(),
      date_range: CommonSchemas.dateRange.optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      metrics_type: z.literal('conversion_metrics'),
      date_range: CommonSchemas.dateRange,
      site_id: CommonSchemas.siteId.optional(),
      goal_id: z.number().int().optional(),
      summary: z.object({
        total_conversions: z.number().int().min(0),
        total_revenue: z.number().min(0),
        goals_count: z.number().int().min(0),
        converting_visits: z.number().int().min(0),
        avg_order_value: z.number().min(0)
      }),
      conversion_data: z.array(z.record(z.any())),
      rows_returned: z.number().int().min(0),
      timestamp: z.string().datetime()
    })
  },
  
  getContentPerformance: {
    input: z.object({
      site_id: CommonSchemas.siteId.optional(),
      date_range: CommonSchemas.dateRange.optional(),
      content_type: CommonSchemas.contentType.optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      performance_type: z.literal('content_performance'),
      content_type: CommonSchemas.contentType,
      date_range: CommonSchemas.dateRange,
      site_id: CommonSchemas.siteId.optional(),
      content_data: z.array(z.record(z.any())),
      rows_returned: z.number().int().min(0),
      timestamp: z.string().datetime()
    })
  },
  
  getCompanyIntelligence: {
    input: z.object({
      company_name: z.string().max(200).optional(),
      domain: z.string().max(255).optional(),
      country: z.string().max(100).optional(),
      date_range: CommonSchemas.dateRange.optional(),
      site_id: CommonSchemas.siteId.optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      intelligence_type: z.literal('company_intelligence'),
      date_range: CommonSchemas.dateRange,
      site_id: CommonSchemas.siteId.optional(),
      filters: z.object({
        company_name: z.string().optional(),
        domain: z.string().optional(),
        country: z.string().optional()
      }),
      summary: z.object({
        unique_companies: z.number().int().min(0),
        total_company_visits: z.number().int().min(0),
        countries_count: z.number().int().min(0),
        industries_count: z.number().int().min(0),
        avg_company_session_duration: z.number().min(0)
      }),
      company_data: z.array(z.record(z.any())),
      rows_returned: z.number().int().min(0),
      timestamp: z.string().datetime()
    })
  }
}

// Cross-Database Tool Schemas
export const CrossDatabaseSchemas = {
  getUnifiedDashboardData: {
    input: z.object({
      company_name: z.string().max(200).optional(),
      date_range: CommonSchemas.dateRange.optional(),
      site_id: CommonSchemas.siteId.optional(),
      include_web_analytics: z.boolean().optional(),
      include_operational_data: z.boolean().optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      dashboard_type: z.literal('unified_dashboard'),
      date_range: CommonSchemas.dateRange,
      company_name: z.string().optional(),
      timestamp: z.string().datetime(),
      data_sources: z.array(z.enum(['mysql_analytics', 'neo4j_operational'])),
      web_analytics: z.record(z.any()).optional(),
      company_analytics: z.array(z.record(z.any())).optional(),
      operational_data: z.array(z.record(z.any())).optional(),
      capability_data: z.array(z.record(z.any())).optional(),
      correlations: z.object({
        companies_with_both_data: z.number().int().min(0),
        web_to_operational_ratio: z.number().min(0).max(1),
        data_correlation_strength: z.enum(['low', 'medium', 'high'])
      }).optional(),
      web_analytics_error: z.string().optional(),
      operational_data_error: z.string().optional()
    })
  },
  
  correlateOperationalRelationships: {
    input: z.object({
      entity_type: CommonSchemas.entityType.optional(),
      entity_name: z.string().max(200).optional(),
      website_domain: z.string().max(255).optional(),
      date_range: CommonSchemas.dateRange.optional(),
      correlation_type: CommonSchemas.correlationType.optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      success: z.boolean(),
      correlation_type: CommonSchemas.correlationType,
      entity_type: CommonSchemas.entityType,
      entity_name: z.string().optional(),
      website_domain: z.string().optional(),
      date_range: CommonSchemas.dateRange,
      timestamp: z.string().datetime(),
      correlations: z.array(z.record(z.any()))
    })
  }
}

// Database Explorer Tool Schemas
export const DatabaseExplorerSchemas = {
  exploreDatabase: {
    input: z.object({
      action: z.enum(['list_tables', 'describe_table', 'sample_data']),
      table_name: z.string().max(100).optional(),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      action: z.enum(['list_tables', 'describe_table', 'sample_data']),
      database_type: z.string(),
      table_name: z.string().optional(),
      tables: z.array(z.string()).optional(),
      total_tables: z.number().int().min(0).optional(),
      columns: z.array(z.record(z.any())).optional(),
      total_columns: z.number().int().min(0).optional(),
      sample_data: z.array(z.record(z.any())).optional(),
      rows_returned: z.number().int().min(0).optional(),
      limit_applied: z.number().int().optional(),
      timestamp: z.string().datetime()
    })
  },
  
  queryDatabase: {
    input: z.object({
      query: z.string().min(1).max(5000),
      limit: CommonSchemas.positiveLimit.optional()
    }),
    output: z.object({
      query: z.string(),
      database_type: z.string(),
      rows_returned: z.number().int().min(0),
      affected_rows: z.number().int().min(0),
      data: z.array(z.record(z.any())),
      execution_time: z.number().min(0),
      timestamp: z.string().datetime(),
      safety_checks_passed: z.boolean()
    })
  },
  
  analyzeData: {
    input: z.object({
      table_name: z.string().min(1).max(100),
      analysis_type: CommonSchemas.analysisType,
      date_column: z.string().max(100).optional(),
      group_by: z.string().max(100).optional()
    }),
    output: z.object({
      analysis_type: CommonSchemas.analysisType,
      table_name: z.string(),
      total_rows: z.number().int().min(0).optional(),
      total_columns: z.number().int().min(0).optional(),
      columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        nullable: z.boolean()
      })).optional(),
      date_column: z.string().optional(),
      period: z.string().optional(),
      trends: z.array(z.record(z.any())).optional(),
      data_points: z.number().int().min(0).optional(),
      group_by_column: z.string().optional(),
      distribution: z.array(z.record(z.any())).optional(),
      categories: z.number().int().min(0).optional(),
      timestamp: z.string().datetime()
    })
  }
}

// Error response schema for all tools
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
  timestamp: z.string().datetime(),
  code: z.string()
})

// Validation utilities
export class ValidationUtils {
  /**
   * Validate input parameters for a tool
   */
  static validateInput<T>(schema: z.ZodSchema<T>, input: unknown, toolName: string): T {
    try {
      return schema.parse(input)
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        throw new Error(`Invalid input for ${toolName}: ${errors}`)
      }
      throw new Error(`Input validation failed for ${toolName}: ${error}`)
    }
  }
  
  /**
   * Validate output data for a tool
   */
  static validateOutput<T>(schema: z.ZodSchema<T>, output: unknown, toolName: string): T {
    try {
      return schema.parse(output)
    } catch (error) {
      console.error(`Output validation failed for ${toolName}:`, error)
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        console.error(`Validation errors: ${errors}`)
      }
      // Return output as-is if validation fails (don't break functionality)
      return output as T
    }
  }
  
  /**
   * Sanitize SQL query string to prevent injection
   */
  static sanitizeSqlQuery(query: string): string {
    // Remove comments
    query = query.replace(/\/\*[\s\S]*?\*\//g, '')
    query = query.replace(/--.*$/gm, '')
    
    // Remove dangerous patterns
    const dangerousPatterns = [
      /\b(drop|delete|update|insert|alter|create|truncate)\b/gi,
      /\b(grant|revoke|exec|execute)\b/gi,
      /\bxp_\w+/gi,
      /\bsp_\w+/gi
    ]
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new Error(`Query contains dangerous pattern: ${pattern.source}`)
      }
    }
    
    return query.trim()
  }
  
  /**
   * Sanitize Cypher query string to prevent injection
   */
  static sanitizeCypherQuery(query: string): string {
    // Remove comments
    query = query.replace(/\/\*[\s\S]*?\*\//g, '')
    query = query.replace(/\/\/.*$/gm, '')
    
    // Check for dangerous patterns in Cypher
    const dangerousPatterns = [
      /\b(delete|remove|set|create|merge)\s+(?!.*where)/gi, // DELETE/REMOVE/SET/CREATE without WHERE
      /\bdrop\b/gi,
      /\bload\s+csv\b/gi
    ]
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new Error(`Query contains potentially dangerous Cypher pattern: ${pattern.source}`)
      }
    }
    
    return query.trim()
  }
  
  /**
   * Validate and sanitize parameters for SQL queries
   */
  static validateSqlParameters(parameters: any[]): any[] {
    return parameters.map(param => {
      if (typeof param === 'string') {
        // Check for SQL injection patterns in string parameters
        if (param.includes(';') || param.includes('--') || param.includes('/*')) {
          throw new Error('Parameter contains potentially dangerous SQL characters')
        }
        // Limit string parameter length
        if (param.length > 1000) {
          throw new Error('Parameter string too long (max 1000 characters)')
        }
      }
      return param
    })
  }
  
  /**
   * Create standardized error response
   */
  static createErrorResponse(toolName: string, error: Error, code?: string) {
    return {
      success: false,
      error: `${toolName} execution failed`,
      message: error.message,
      timestamp: new Date().toISOString(),
      code: code || `${toolName.toUpperCase()}_ERROR`
    }
  }
}