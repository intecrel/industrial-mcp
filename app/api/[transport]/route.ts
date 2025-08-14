import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { getRequestValidator, validateSqlQuery, validateCypherQuery } from '../../../lib/security/request-validator';
import { applyCORSHeaders } from '../../../lib/security/cors-config';
import { NextRequest } from 'next/server';
import { 
  authenticateRequest, 
  hasToolPermission, 
  getAuthInfo, 
  createAuthError,
  AuthContext 
} from '../../../lib/oauth/auth-middleware';

// Usage tracking interface
interface UsageEntry {
  userId: string;
  apiKey: string;
  toolName: string;
  timestamp: number;
  params?: any;
  ipAddress?: string;
  userAgent?: string;
}

// In-memory usage tracking (in production, use a database)
const usageLog: UsageEntry[] = [];


// API Key configuration interface
interface ApiKeyConfig {
  key: string;
  userId: string;
  name?: string;
  permissions?: string[];
  rateLimitPerHour?: number;
}



// Log usage for analytics
const logUsage = (apiKeyConfig: ApiKeyConfig, toolName: string, params?: any) => {
  const entry: UsageEntry = {
    userId: apiKeyConfig.userId,
    apiKey: apiKeyConfig.key.substring(0, 8) + '***', // Mask API key in logs
    toolName,
    timestamp: Date.now(),
    params: params ? JSON.stringify(params).substring(0, 200) : undefined, // Truncate for storage
    ipAddress: (globalThis as any).currentRequestIP || 'unknown',
    userAgent: (globalThis as any).currentRequestUserAgent || 'unknown'
  };
  
  usageLog.push(entry);
  
  // Keep only last 1000 entries to prevent memory issues
  if (usageLog.length > 1000) {
    usageLog.splice(0, usageLog.length - 1000);
  }
  
  console.log(`📊 Usage logged: ${apiKeyConfig.userId} used ${toolName}`);
};


// Security: Query validation wrapper
const validateAndSanitizeQuery = (query: string, type: 'sql' | 'cypher'): string => {
  const result = type === 'sql' ? validateSqlQuery(query) : validateCypherQuery(query);
  
  if (result.blocked) {
    throw new Error(`${type.toUpperCase()} injection attempt blocked: ${result.reason}`);
  }
  
  if (!result.valid) {
    console.warn(`⚠️ ${type.toUpperCase()} validation warnings:`, result.errors);
  }
  
  return result.sanitized || query;
};

// Security: Enhanced request validation
const validateRequestSecurity = (request: any, body?: any): void => {
  const validator = getRequestValidator();
  
  const validation = validator.validateRequest({
    method: request.method,
    headers: request.headers,
    body,
    url: request.url
  });
  
  if (validation.blocked) {
    throw new Error(`Security violation: ${validation.reason}`);
  }
  
  if (!validation.valid && validation.errors.length > 0) {
    console.warn('⚠️ Request security warnings:', validation.errors);
  }
};

// Enhanced tool wrapper with dual authentication and scope checking
const authenticatedTool = (toolName: string, toolFn: (params: any) => Promise<any>) => {
  return async (params: any) => {
    try {
      // Check if user has permission to access this tool
      if (currentAuthContext && !hasToolPermission(currentAuthContext, toolName)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Access denied: ${toolName}`,
                message: `Insufficient permissions for tool: ${toolName}`,
                required_scopes: getRequiredScopesForTool(toolName),
                current_auth: getAuthInfo(currentAuthContext),
                timestamp: new Date().toISOString(),
                code: "AUTHORIZATION_ERROR",
                tool: toolName
              }, null, 2)
            }
          ],
        };
      }
      
      // Log usage for analytics if user is authenticated
      if (currentApiKeyConfig) {
        logUsage(currentApiKeyConfig, toolName, params);
      } else if (currentAuthContext) {
        logOAuthUsage(currentAuthContext, toolName, params);
      }
      
      // Execute the tool
      const result = await toolFn(params);
      return result;
    } catch (error) {
      console.error(`❌ Error in tool ${toolName}:`, error instanceof Error ? error.message : String(error));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Tool execution failed: ${toolName}`,
              message: error instanceof Error ? error.message : "Tool execution error",
              timestamp: new Date().toISOString(),
              code: "TOOL_EXECUTION_ERROR",
              tool: toolName
            }, null, 2)
          }
        ],
      };
    }
  };
};

// Helper function to get required scopes for a tool
const getRequiredScopesForTool = (toolName: string): string[] => {
  // Map tools to their required scopes based on the OAuth scope definitions
  const toolScopeMap: Record<string, string[]> = {
    'query_matomo_database': ['read:analytics'],
    'get_visitor_analytics': ['read:analytics'],
    'get_conversion_metrics': ['read:analytics'],
    'get_content_performance': ['read:analytics'],
    'get_company_intelligence': ['read:analytics'],
    'query_knowledge_graph': ['read:knowledge'],
    'get_organizational_structure': ['read:knowledge'],
    'find_capability_paths': ['read:knowledge'],
    'get_knowledge_graph_stats': ['read:knowledge'],
    'get_usage_analytics': ['admin:usage'],
    'get_cloud_sql_status': ['admin:usage'],
    'get_cloud_sql_info': ['admin:usage'],
    'echo': ['admin:usage']
  };
  
  return toolScopeMap[toolName] || [];
};

// OAuth usage logging
const logOAuthUsage = (authContext: AuthContext, toolName: string, params?: any) => {
  const entry: UsageEntry = {
    userId: authContext.userId,
    apiKey: `oauth:${authContext.clientId}` || 'oauth:unknown',
    toolName,
    timestamp: Date.now(),
    params: params ? JSON.stringify(params).substring(0, 200) : undefined,
    ipAddress: (globalThis as any).currentRequestIP || 'unknown',
    userAgent: (globalThis as any).currentRequestUserAgent || 'unknown'
  };
  
  usageLog.push(entry);
  
  // Keep only last 1000 entries to prevent memory issues
  if (usageLog.length > 1000) {
    usageLog.splice(0, usageLog.length - 1000);
  }
  
  console.log(`📊 OAuth Usage logged: ${getAuthInfo(authContext)} used ${toolName}`);
};

// Simple in-memory cache for performance optimization
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();

// Cache utility functions
const getCacheKey = (toolName: string, params: any) => 
  `${toolName}:${JSON.stringify(params)}`;

const isCacheValid = (entry: CacheEntry) => 
  Date.now() - entry.timestamp < entry.ttl;

const getFromCache = (key: string): any | null => {
  const entry = cache.get(key);
  if (entry && isCacheValid(entry)) {
    console.log(`🚀 Cache hit for ${key}`);
    return entry.data;
  }
  if (entry) {
    cache.delete(key); // Remove expired entry
  }
  return null;
};

const setCache = (key: string, data: any, ttl: number = 30000) => {
  cache.set(key, { data, timestamp: Date.now(), ttl });
  console.log(`💾 Cached ${key} for ${ttl}ms`);
};

// Global variable to store current request's authentication info (for this serverless instance)
let currentApiKeyConfig: ApiKeyConfig | null = null;
let currentAuthContext: AuthContext | null = null;

/**
 * Industrial MCP Server Handler
 * 
 * This creates a Model Context Protocol (MCP) server using Vercel's MCP adapter.
 * The dynamic [transport] route parameter allows this handler to respond to:
 * - /api/mcp (JSON-RPC over HTTP)
 * - /api/stdio (for CLI tools)
 * - /api/sse (Server-Sent Events for streaming)
 */
const handler = createMcpHandler(
  // Server configuration function - define tools here
  async (server) => {
    // Register the "echo" tool
    server.tool(
      "echo",
      "Echo back the provided message",
      {
        // Tool parameters schema using zod
        message: z.string().describe("The message to echo back"),
      },
      // Tool implementation with authentication
      authenticatedTool("echo", async ({ message }) => ({
        content: [{ type: "text", text: `Tool echo: ${message}` }],
      }))
    );
    
    // Register database exploration tool
    server.tool(
      "explore_database",
      "Explore database structure - list tables, inspect schemas, and discover data",
      {
        action: z.enum(['list_tables', 'describe_table', 'sample_data']).describe("What to explore: list_tables, describe_table, or sample_data"),
        table_name: z.string().optional().describe("Table name (required for describe_table and sample_data)"),
        limit: z.number().optional().describe("Number of sample rows to return (default: 10)")
      },
      authenticatedTool("explore_database", async ({ action, table_name, limit = 10 }) => {
        const cacheKey = getCacheKey('explore_database', { action, table_name, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import database tools dynamically
          const { exploreDatabaseStructure } = await import('../mcp/tools/database-explorer')
          
          const explorationData = await exploreDatabaseStructure({ 
            action, 
            table_name, 
            limit 
          })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(explorationData, null, 2)
              }
            ],
          };

          // Cache for 60 seconds (schema info doesn't change frequently)
          setCache(cacheKey, response, 60000);
          
          console.log(`🔍 Database exploration requested - Action: ${action}`)
          return response;
        } catch (error) {
          console.error('❌ Error exploring database:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to explore database",
                  message: error instanceof Error ? error.message : "Unable to connect to database",
                  timestamp: new Date().toISOString(),
                  code: "DATABASE_EXPLORATION_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    // Register database query tool
    server.tool(
      "query_database",
      "Execute custom SQL queries safely with automatic query validation",
      {
        query: z.string().describe("SQL query to execute (SELECT statements only for safety)"),
        limit: z.number().optional().describe("Maximum number of rows to return (default: 100)")
      },
      authenticatedTool("query_database", async ({ query, limit = 100 }) => {
        const cacheKey = getCacheKey('query_database', { query, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import database tools dynamically
          const { executeCustomQuery } = await import('../mcp/tools/database-explorer')
          
          const queryResult = await executeCustomQuery({ query, limit })

          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(queryResult, null, 2)
              }
            ],
          };

          // Cache based on query complexity - simple queries can be cached longer
          const cacheDuration = query.toLowerCase().includes('now()') || 
                               query.toLowerCase().includes('current_timestamp') ? 10000 : // 10 seconds for time-sensitive queries
                               query.toLowerCase().includes('count') || 
                               query.toLowerCase().includes('sum') ? 60000 : // 1 minute for aggregations
                               300000; // 5 minutes for static data queries
          
          setCache(cacheKey, response, cacheDuration);

          console.log(`📊 Database query executed - Length: ${query.length} chars`)
          return response;
        } catch (error) {
          console.error('❌ Error executing database query:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to execute database query",
                  message: error instanceof Error ? error.message : "Query execution failed",
                  timestamp: new Date().toISOString(),
                  code: "DATABASE_QUERY_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    // Register analytics helper tool
    server.tool(
      "analyze_data",
      "Generate analytics insights from database tables with common patterns",
      {
        table_name: z.string().describe("Table name to analyze"),
        analysis_type: z.enum(['summary', 'trends', 'distribution']).describe("Type of analysis: summary, trends, or distribution"),
        date_column: z.string().optional().describe("Date/timestamp column name for trend analysis"),
        group_by: z.string().optional().describe("Column to group by for distribution analysis")
      },
      authenticatedTool("analyze_data", async ({ table_name, analysis_type, date_column, group_by }) => {
        try {
          const cacheKey = getCacheKey('analyze_data', { table_name, analysis_type, date_column, group_by });
          const cached = getFromCache(cacheKey);
          if (cached) return cached;

          // Import analytics tools dynamically
          const { analyzeTableData } = await import('../mcp/tools/database-explorer')
          
          const analysisResult = await analyzeTableData({ 
            table_name, 
            analysis_type, 
            date_column, 
            group_by 
          })

          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(analysisResult, null, 2)
              }
            ],
          };

          // Cache analysis results for 5 minutes
          setCache(cacheKey, response, 300000);

          console.log(`📈 Data analysis requested - Table: ${table_name}, Type: ${analysis_type}`)
          return response;
        } catch (error) {
          console.error('❌ Error analyzing data:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to analyze data",
                  message: error instanceof Error ? error.message : "Data analysis failed",
                  timestamp: new Date().toISOString(),
                  code: "DATA_ANALYSIS_ERROR",
                  table_name: table_name || "unknown"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    // Register Cloud SQL status tool
    server.tool(
      "get_cloud_sql_status",
      "Get Cloud SQL database connection status and health information",
      {
        database: z.string().optional().describe("Specific database name to check (optional)"),
        include_details: z.boolean().optional().describe("Include detailed connection information")
      },
      authenticatedTool("get_cloud_sql_status", async ({ database, include_details = false }) => {
        try {
          // Import dynamically to avoid build issues
          const { getCloudSQLStatus } = await import('../mcp/tools/cloud-sql-status')
          
          const cacheKey = getCacheKey('cloud_sql_status', { database, include_details });
          const cached = getFromCache(cacheKey);
          if (cached) return cached;
          
          const statusData = await getCloudSQLStatus({ database, include_details })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(statusData, null, 2)
              }
            ],
          };

          // Cache for 30 seconds (database status doesn't change frequently)
          setCache(cacheKey, response, 30000);
          
          console.log(`📊 Cloud SQL status requested for ${database || 'all databases'}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting Cloud SQL status:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve Cloud SQL status",
                  message: error instanceof Error ? error.message : "Unable to connect to Cloud SQL",
                  timestamp: new Date().toISOString(),
                  code: "CLOUD_SQL_STATUS_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    // Register Cloud SQL system info tool
    server.tool(
      "get_cloud_sql_info",
      "Get Cloud SQL system configuration and connection information",
      {},
      authenticatedTool("get_cloud_sql_info", async () => {
        try {
          // Import dynamically to avoid build issues
          const { getCloudSQLSystemInfo } = await import('../mcp/tools/cloud-sql-status')
          
          const cacheKey = getCacheKey('cloud_sql_info', {});
          const cached = getFromCache(cacheKey);
          if (cached) return cached;
          
          const systemInfo = await getCloudSQLSystemInfo()
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(systemInfo, null, 2)
              }
            ],
          };

          // Cache for 60 seconds (system info changes infrequently)
          setCache(cacheKey, response, 60000);
          
          console.log('🔍 Cloud SQL system info requested')
          return response;
        } catch (error) {
          console.error('❌ Error getting Cloud SQL system info:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve Cloud SQL system info",
                  message: error instanceof Error ? error.message : "Unable to access system information",
                  timestamp: new Date().toISOString(),
                  code: "CLOUD_SQL_INFO_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    // Register Neo4j Knowledge Graph tools
    server.tool(
      "query_knowledge_graph",
      "Execute parameterized Cypher queries against the knowledge graph with injection prevention",
      {
        query: z.string().describe("Cypher query to execute (read-only operations only)"),
        parameters: z.record(z.any()).optional().describe("Named parameters for the query"),
        limit: z.number().optional().describe("Maximum number of results to return (default: 100)")
      },
      authenticatedTool("query_knowledge_graph", async ({ query, parameters = {}, limit = 100 }) => {
        const cacheKey = getCacheKey('query_knowledge_graph', { query, parameters, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Neo4j tools dynamically
          const { queryKnowledgeGraph } = await import('../mcp/tools/neo4j-knowledge-graph')
          
          const queryResult = await queryKnowledgeGraph({ query, parameters, limit })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(queryResult, null, 2)
              }
            ],
          };

          // Cache results for 5 minutes (knowledge graph data doesn't change frequently)
          setCache(cacheKey, response, 300000);
          
          console.log(`🔍 Neo4j knowledge graph query executed - Success: ${queryResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error executing knowledge graph query:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to execute knowledge graph query",
                  message: error instanceof Error ? error.message : "Query execution failed",
                  timestamp: new Date().toISOString(),
                  code: "KNOWLEDGE_GRAPH_QUERY_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );

    server.tool(
      "get_organizational_structure",
      "Get organizational structure including departments and reporting hierarchies from the knowledge graph",
      {
        department: z.string().optional().describe("Specific department name or ID to focus on"),
        depth: z.number().optional().describe("Maximum hierarchy depth to traverse (default: 3)"),
        include_employees: z.boolean().optional().describe("Include employee information (default: false)")
      },
      authenticatedTool("get_organizational_structure", async ({ department, depth = 3, include_employees = false }) => {
        const cacheKey = getCacheKey('get_organizational_structure', { department, depth, include_employees });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Neo4j tools dynamically
          const { getOrganizationalStructure } = await import('../mcp/tools/neo4j-knowledge-graph')
          
          const structureResult = await getOrganizationalStructure({ 
            department, 
            depth, 
            includeEmployees: include_employees 
          })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(structureResult, null, 2)
              }
            ],
          };

          // Cache for 10 minutes (organizational structure changes infrequently)
          setCache(cacheKey, response, 600000);
          
          console.log(`🏢 Organizational structure query executed - Success: ${structureResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting organizational structure:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve organizational structure",
                  message: error instanceof Error ? error.message : "Structure query failed",
                  timestamp: new Date().toISOString(),
                  code: "ORGANIZATIONAL_STRUCTURE_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );

    server.tool(
      "find_capability_paths",
      "Find capability paths and skill networks within the organization using knowledge graph analysis",
      {
        skill: z.string().describe("Target skill to analyze paths for"),
        source_employee: z.string().optional().describe("Starting employee name or ID for path analysis"),
        target_role: z.string().optional().describe("Target role or position to find paths to"),
        max_hops: z.number().optional().describe("Maximum relationship hops to traverse (default: 4)")
      },
      authenticatedTool("find_capability_paths", async ({ skill, source_employee, target_role, max_hops = 4 }) => {
        const cacheKey = getCacheKey('find_capability_paths', { skill, source_employee, target_role, max_hops });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Neo4j tools dynamically
          const { findCapabilityPaths } = await import('../mcp/tools/neo4j-knowledge-graph')
          
          const pathsResult = await findCapabilityPaths({ 
            skill, 
            sourceEmployee: source_employee, 
            targetRole: target_role, 
            maxHops: max_hops 
          })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(pathsResult, null, 2)
              }
            ],
          };

          // Cache for 15 minutes (capability analysis can be computationally expensive)
          setCache(cacheKey, response, 900000);
          
          console.log(`🎯 Capability paths analysis executed - Success: ${pathsResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error finding capability paths:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to find capability paths",
                  message: error instanceof Error ? error.message : "Capability analysis failed",
                  timestamp: new Date().toISOString(),
                  code: "CAPABILITY_PATHS_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );

    server.tool(
      "get_knowledge_graph_stats",
      "Get knowledge graph statistics and health information including node/relationship counts",
      {},
      authenticatedTool("get_knowledge_graph_stats", async () => {
        const cacheKey = getCacheKey('get_knowledge_graph_stats', {});
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Neo4j tools dynamically
          const { getKnowledgeGraphStats } = await import('../mcp/tools/neo4j-knowledge-graph')
          
          const statsResult = await getKnowledgeGraphStats()
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(statsResult, null, 2)
              }
            ],
          };

          // Cache for 5 minutes (stats don't change frequently but we want reasonably current data)
          setCache(cacheKey, response, 300000);
          
          console.log(`📊 Knowledge graph stats retrieved - Success: ${statsResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting knowledge graph stats:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve knowledge graph statistics",
                  message: error instanceof Error ? error.message : "Stats retrieval failed",
                  timestamp: new Date().toISOString(),
                  code: "KNOWLEDGE_GRAPH_STATS_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    // Register Matomo Analytics Tools
    server.tool(
      "query_matomo_database",
      "Execute secure parameterized Matomo database queries with injection prevention",
      {
        query: z.string().describe("SQL query to execute (SELECT statements only, must target matomo_ tables)"),
        parameters: z.array(z.any()).optional().describe("Named parameters for the query"),
        limit: z.number().optional().describe("Maximum number of rows to return (default: 100)")
      },
      authenticatedTool("query_matomo_database", async ({ query, parameters = [], limit = 100 }) => {
        const cacheKey = getCacheKey('query_matomo_database', { query, parameters, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Matomo analytics tools dynamically
          const { queryMatomoDatabase } = await import('../mcp/tools/mysql-analytics-tools')
          
          const queryResult = await queryMatomoDatabase({ query, parameters, limit })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(queryResult, null, 2)
              }
            ],
          };

          // Cache based on query complexity - analytics queries can be cached for reasonable time
          const cacheDuration = query.toLowerCase().includes('now()') || 
                               query.toLowerCase().includes('current_timestamp') ? 30000 : // 30 seconds for time-sensitive queries
                               query.toLowerCase().includes('count') || 
                               query.toLowerCase().includes('sum') ? 120000 : // 2 minutes for aggregations
                               300000; // 5 minutes for static data queries
          
          setCache(cacheKey, response, cacheDuration);
          
          console.log(`📊 Matomo database query executed - Success: ${queryResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error executing Matomo query:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to execute Matomo query",
                  message: error instanceof Error ? error.message : "Query execution failed",
                  timestamp: new Date().toISOString(),
                  code: "MATOMO_QUERY_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );

    server.tool(
      "get_visitor_analytics",
      "Get visitor analytics including traffic patterns and user behavior from Matomo",
      {
        date_range: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'current_month']).optional().describe("Date range for analytics (default: last_7_days)"),
        site_id: z.number().optional().describe("Specific site ID to analyze"),
        limit: z.number().optional().describe("Maximum number of results to return (default: 100)")
      },
      authenticatedTool("get_visitor_analytics", async ({ date_range = 'last_7_days', site_id, limit = 100 }) => {
        const cacheKey = getCacheKey('get_visitor_analytics', { date_range, site_id, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Matomo analytics tools dynamically
          const { getVisitorAnalytics } = await import('../mcp/tools/mysql-analytics-tools')
          
          const analyticsResult = await getVisitorAnalytics({ date_range, site_id, limit })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(analyticsResult, null, 2)
              }
            ],
          };

          // Cache visitor analytics for 10 minutes
          setCache(cacheKey, response, 600000);
          
          console.log(`📈 Visitor analytics retrieved - Success: ${analyticsResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting visitor analytics:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve visitor analytics",
                  message: error instanceof Error ? error.message : "Analytics retrieval failed",
                  timestamp: new Date().toISOString(),
                  code: "VISITOR_ANALYTICS_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );

    server.tool(
      "get_conversion_metrics",
      "Get conversion metrics including goal tracking and funnel analysis from Matomo",
      {
        site_id: z.number().optional().describe("Specific site ID to analyze"),
        goal_id: z.number().optional().describe("Specific goal ID to analyze"),
        date_range: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'current_month']).optional().describe("Date range for metrics (default: last_30_days)"),
        limit: z.number().optional().describe("Maximum number of results to return (default: 50)")
      },
      authenticatedTool("get_conversion_metrics", async ({ site_id, goal_id, date_range = 'last_30_days', limit = 50 }) => {
        const cacheKey = getCacheKey('get_conversion_metrics', { site_id, goal_id, date_range, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Matomo analytics tools dynamically
          const { getConversionMetrics } = await import('../mcp/tools/mysql-analytics-tools')
          
          const metricsResult = await getConversionMetrics({ site_id, goal_id, date_range, limit })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(metricsResult, null, 2)
              }
            ],
          };

          // Cache conversion metrics for 15 minutes
          setCache(cacheKey, response, 900000);
          
          console.log(`🎯 Conversion metrics retrieved - Success: ${metricsResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting conversion metrics:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve conversion metrics",
                  message: error instanceof Error ? error.message : "Metrics retrieval failed",
                  timestamp: new Date().toISOString(),
                  code: "CONVERSION_METRICS_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );

    server.tool(
      "get_content_performance",
      "Get content performance including page views, bounce rates, and engagement from Matomo",
      {
        site_id: z.number().optional().describe("Specific site ID to analyze"),
        date_range: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'current_month']).optional().describe("Date range for performance data (default: last_30_days)"),
        content_type: z.enum(['pages', 'entry_pages', 'exit_pages']).optional().describe("Type of content analysis (default: pages)"),
        limit: z.number().optional().describe("Maximum number of results to return (default: 50)")
      },
      authenticatedTool("get_content_performance", async ({ site_id, date_range = 'last_30_days', content_type = 'pages', limit = 50 }) => {
        const cacheKey = getCacheKey('get_content_performance', { site_id, date_range, content_type, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Matomo analytics tools dynamically
          const { getContentPerformance } = await import('../mcp/tools/mysql-analytics-tools')
          
          const performanceResult = await getContentPerformance({ site_id, date_range, content_type, limit })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(performanceResult, null, 2)
              }
            ],
          };

          // Cache content performance for 10 minutes
          setCache(cacheKey, response, 600000);
          
          console.log(`📄 Content performance retrieved - Success: ${performanceResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting content performance:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve content performance",
                  message: error instanceof Error ? error.message : "Performance analysis failed",
                  timestamp: new Date().toISOString(),
                  code: "CONTENT_PERFORMANCE_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );

    server.tool(
      "get_company_intelligence",
      "Get B2B company intelligence from visitor data using enriched session data",
      {
        company_name: z.string().optional().describe("Filter by company name (partial match)"),
        domain: z.string().optional().describe("Filter by company domain"),
        country: z.string().optional().describe("Filter by company country"),
        date_range: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'current_month']).optional().describe("Date range for intelligence data (default: last_30_days)"),
        site_id: z.number().optional().describe("Specific site ID to analyze"),
        limit: z.number().optional().describe("Maximum number of companies to return (default: 50)")
      },
      authenticatedTool("get_company_intelligence", async ({ company_name, domain, country, date_range = 'last_30_days', site_id, limit = 50 }) => {
        const cacheKey = getCacheKey('get_company_intelligence', { company_name, domain, country, date_range, site_id, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Import Matomo analytics tools dynamically
          const { getCompanyIntelligence } = await import('../mcp/tools/mysql-analytics-tools')
          
          const intelligenceResult = await getCompanyIntelligence({ 
            company_name, 
            domain, 
            country, 
            date_range, 
            site_id, 
            limit 
          })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(intelligenceResult, null, 2)
              }
            ],
          };

          // Cache company intelligence for 20 minutes (more expensive queries)
          setCache(cacheKey, response, 1200000);
          
          console.log(`🏢 Company intelligence retrieved - Success: ${intelligenceResult.success}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting company intelligence:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve company intelligence",
                  message: error instanceof Error ? error.message : "Intelligence analysis failed",
                  timestamp: new Date().toISOString(),
                  code: "COMPANY_INTELLIGENCE_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    // Register usage analytics tool (admin-only)
    server.tool(
      "get_usage_analytics",
      "Get usage analytics and API key statistics (admin only)",
      {
        period_hours: z.number().optional().describe("Hours to look back (default: 24)"),
        user_id: z.string().optional().describe("Filter by specific user ID")
      },
      authenticatedTool("get_usage_analytics", async ({ period_hours = 24, user_id }) => {
        try {
          const periodMs = period_hours * 60 * 60 * 1000;
          const cutoffTime = Date.now() - periodMs;
          
          // Filter usage logs
          let filteredLogs = usageLog.filter(entry => entry.timestamp > cutoffTime);
          if (user_id) {
            filteredLogs = filteredLogs.filter(entry => entry.userId === user_id);
          }
          
          // Calculate statistics
          const stats = {
            period_hours,
            total_requests: filteredLogs.length,
            unique_users: Array.from(new Set(filteredLogs.map(entry => entry.userId))).length,
            requests_by_user: {} as Record<string, number>,
            requests_by_tool: {} as Record<string, number>,
            timeline: [] as Array<{hour: string, count: number}>
          };
          
          // Group by user
          filteredLogs.forEach(entry => {
            stats.requests_by_user[entry.userId] = (stats.requests_by_user[entry.userId] || 0) + 1;
            stats.requests_by_tool[entry.toolName] = (stats.requests_by_tool[entry.toolName] || 0) + 1;
          });
          
          // Timeline by hour
          const hourlyStats = new Map<string, number>();
          filteredLogs.forEach(entry => {
            const hour = new Date(entry.timestamp).toISOString().slice(0, 13) + ':00:00';
            hourlyStats.set(hour, (hourlyStats.get(hour) || 0) + 1);
          });
          
          stats.timeline = Array.from(hourlyStats.entries())
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => a.hour.localeCompare(b.hour));
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(stats, null, 2)
              }
            ],
          };
        } catch (error) {
          console.error('❌ Error getting usage analytics:', error);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve usage analytics",
                  message: error instanceof Error ? error.message : "Analytics unavailable",
                  timestamp: new Date().toISOString(),
                  code: "USAGE_ANALYTICS_ERROR"
                }, null, 2)
              }
            ],
          };
        }
      })
    );
    
    // Register Cross-Database Query Tools
    server.tool(
      "get_unified_dashboard_data",
      "Get unified dashboard data combining metrics from both Neo4j (industrial) and MySQL (analytics) databases",
      {
        company_name: z.string().optional().describe("Filter by company name for cross-database correlation"),
        date_range: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'current_month']).optional().describe("Date range for analytics data (default: last_30_days)"),
        site_id: z.number().optional().describe("Specific site ID for analytics filtering"),
        include_web_analytics: z.boolean().optional().describe("Include MySQL web analytics data (default: true)"),
        include_operational_data: z.boolean().optional().describe("Include Neo4j operational data (default: true)"),
        limit: z.number().optional().describe("Maximum number of results per data source (default: 50)")
      },
      authenticatedTool("get_unified_dashboard_data", async ({ company_name, date_range = 'last_30_days', site_id, include_web_analytics = true, include_operational_data = true, limit = 50 }) => {
        const cacheKey = getCacheKey('get_unified_dashboard_data', { company_name, date_range, site_id, include_web_analytics, include_operational_data, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }
          
          // Import cross-database tools dynamically
          const { getUnifiedDashboardData } = await import('../mcp/tools/cross-database-tools')
          
          const dashboardResult = await getUnifiedDashboardData({ 
            company_name, 
            date_range, 
            site_id, 
            include_web_analytics, 
            include_operational_data, 
            limit 
          })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(dashboardResult, null, 2)
              }
            ],
          };

          // Cache unified dashboard data for 10 minutes (combines multiple data sources)
          setCache(cacheKey, response, 600000);

          console.log(`📊 Unified dashboard data requested - Company: ${company_name || 'all'}, Sources: ${[include_web_analytics && 'MySQL', include_operational_data && 'Neo4j'].filter(Boolean).join(', ')}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting unified dashboard data:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve unified dashboard data",
                  message: error instanceof Error ? error.message : "Cross-database query failed",
                  timestamp: new Date().toISOString(),
                  code: "UNIFIED_DASHBOARD_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
    
    server.tool(
      "correlate_operational_relationships",
      "Correlate operational relationships with web analytics data across Neo4j and MySQL databases",
      {
        entity_type: z.enum(['Machine', 'Process', 'Service', 'Company', 'Location']).optional().describe("Type of operational entity to correlate (default: Company)"),
        entity_name: z.string().optional().describe("Specific entity name to correlate"),
        website_domain: z.string().optional().describe("Website domain for visitor correlation"),
        date_range: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'current_month']).optional().describe("Date range for correlation analysis (default: last_30_days)"),
        correlation_type: z.enum(['visitor_to_entity', 'company_to_operations', 'geographic_correlation']).optional().describe("Type of correlation analysis (default: company_to_operations)"),
        limit: z.number().optional().describe("Maximum number of correlations to return (default: 30)")
      },
      authenticatedTool("correlate_operational_relationships", async ({ entity_type = 'Company', entity_name, website_domain, date_range = 'last_30_days', correlation_type = 'company_to_operations', limit = 30 }) => {
        const cacheKey = getCacheKey('correlate_operational_relationships', { entity_type, entity_name, website_domain, date_range, correlation_type, limit });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }
          
          // Import cross-database tools dynamically
          const { correlateOperationalRelationships } = await import('../mcp/tools/cross-database-tools')
          
          const correlationResult = await correlateOperationalRelationships({ 
            entity_type, 
            entity_name, 
            website_domain, 
            date_range, 
            correlation_type, 
            limit 
          })
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(correlationResult, null, 2)
              }
            ],
          };

          // Cache correlation data for 15 minutes (complex cross-database analysis)
          setCache(cacheKey, response, 900000);

          console.log(`🔗 Operational correlation requested - Type: ${correlation_type}, Entity: ${entity_name || entity_type}, Domain: ${website_domain || 'all'}`)
          return response;
        } catch (error) {
          console.error('❌ Error correlating operational relationships:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to correlate operational relationships",
                  message: error instanceof Error ? error.message : "Cross-database correlation failed",
                  timestamp: new Date().toISOString(),
                  code: "OPERATIONAL_CORRELATION_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      })
    );
  },
  // Capabilities configuration
  {
    capabilities: {
      tools: {
        echo: {
          description: "Echo a message",
        },
        explore_database: {
          description: "Explore database structure and discover data",
        },
        query_database: {
          description: "Execute custom SQL queries safely",
        },
        analyze_data: {
          description: "Generate analytics insights from database tables",
        },
        get_cloud_sql_status: {
          description: "Get Cloud SQL database status and health",
        },
        get_cloud_sql_info: {
          description: "Get Cloud SQL system configuration",
        },
        get_usage_analytics: {
          description: "Get API usage analytics and statistics",
        },
        query_knowledge_graph: {
          description: "Execute parameterized Cypher queries against the knowledge graph",
        },
        get_organizational_structure: {
          description: "Get organizational structure and department hierarchies",
        },
        find_capability_paths: {
          description: "Find capability paths and skill networks in the organization",
        },
        get_knowledge_graph_stats: {
          description: "Get knowledge graph statistics and health information",
        },
        query_matomo_database: {
          description: "Execute secure parameterized Matomo database queries",
        },
        get_visitor_analytics: {
          description: "Get visitor analytics and traffic patterns from Matomo",
        },
        get_conversion_metrics: {
          description: "Get conversion metrics and goal tracking from Matomo",
        },
        get_content_performance: {
          description: "Get content performance and page analytics from Matomo",
        },
        get_company_intelligence: {
          description: "Get B2B company intelligence from visitor data",
        },
        get_unified_dashboard_data: {
          description: "Get unified dashboard data combining Neo4j industrial and MySQL analytics data",
        },
        correlate_operational_relationships: {
          description: "Correlate operational relationships with web analytics across databases",
        },
      },
    },
  },
  // MCP adapter options
  {
    // IMPORTANT: basePath must match the route location
    // Since this file is at app/api/[transport]/route.ts,
    // basePath must be "/api" for /api/mcp to work correctly
    basePath: "/api",
    verboseLogs: true,
    maxDuration: 60,
  }
);

// Create secured wrapper for the handler with comprehensive protection
const createSecuredHandler = (originalHandler: (request: Request, context?: any) => Promise<Response>) => {
  return async (request: Request, context?: any) => {
    const startTime = Date.now();
    let response: Response;
    
    try {
      // Security: Store request context for logging
      const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      (globalThis as any).currentRequestIP = clientIP;
      (globalThis as any).currentRequestUserAgent = userAgent;
      
      // Security: Comprehensive request validation
      let requestBody: any;
      try {
        if (request.method === 'POST' && request.headers.get('content-type')?.includes('application/json')) {
          requestBody = await request.clone().json();
        }
      } catch {
        // Ignore JSON parsing errors for non-JSON requests
      }
      
      validateRequestSecurity(request, requestBody);
      
      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        response = new Response(null, { 
          status: 204,
          headers: { 'Content-Length': '0' }
        });
        applyCORSHeaders(request, response, process.env.NODE_ENV as any);
        return response;
      }
      
      // Check if this is an MCP discovery call that should be allowed without authentication
      // Claude.ai needs to discover available tools before authentication can complete
      const isDiscoveryCall = requestBody && (
        requestBody.method === 'ping' ||
        requestBody.method === 'initialize' ||
        requestBody.method === 'capabilities' ||
        requestBody.method === 'server/info' ||
        // Remove tools/list - it should require authentication to trigger Connect button
        !requestBody.method // Allow metadata requests
      );
      
      // Also allow GET requests for metadata discovery and MCP protocol discovery
      const isMetadataRequest = request.method === 'GET';
      
      // Allow HEAD requests for connectivity checks
      const isConnectivityCheck = request.method === 'HEAD';
      
      // Dual Authentication: Support both OAuth Bearer tokens and API key authentication
      // Allow discovery calls, metadata requests, and connectivity checks without authentication for Claude.ai compatibility
      if (!isDiscoveryCall && !isMetadataRequest && !isConnectivityCheck) {
        console.log(`🔐 MCP request requires authentication: ${request.method} ${requestBody?.method || 'no-method'}`);
        try {
          // Create a minimal NextRequest-compatible object for authentication
          const requestForAuth = {
            headers: {
              get: (name: string) => request.headers.get(name)
            },
            url: request.url,
            method: request.method
          } as NextRequest;
          
          const authHeader = request.headers.get('authorization');
          console.log(`🔍 Auth header present: ${authHeader ? 'YES' : 'NO'} ${authHeader ? `(${authHeader.substring(0, 20)}...)` : ''}`);
          
          const authContext = await authenticateRequest(requestForAuth);
          
          // Store authenticated user info for tools to access
          currentAuthContext = authContext;
          
          // If using MAC address authentication, also populate legacy API key config
          if (authContext.method === 'mac_address') {
            // Create compatible API key config for legacy usage logging
            currentApiKeyConfig = {
              key: 'mac_address_auth',
              userId: authContext.userId,
              name: 'MAC Address Authentication',
              permissions: authContext.permissions
            };
          } else {
            currentApiKeyConfig = null; // OAuth doesn't use legacy API key config
          }
          
          console.log(`✅ Dual authentication success: ${getAuthInfo(authContext)} from ${clientIP}`);
          
        } catch (authError) {
          console.error('❌ Authentication failed:', authError);
          const errorResponse = createAuthError(
            authError instanceof Error ? authError.message : 'Authentication failed',
            401
          );
          
          // Add WWW-Authenticate header as required by MCP Authorization spec
          const baseUrl = process.env.NODE_ENV === 'development' 
            ? 'http://localhost:3000' 
            : 'https://industrial-mcp-delta.vercel.app';
          
          response = Response.json({
            ...errorResponse,
            timestamp: new Date().toISOString()
          }, { 
            status: 401,
            headers: {
              'WWW-Authenticate': `Bearer realm="MCP Server", authorization_uri="${baseUrl}/api/oauth/authorize", error="invalid_token", error_description="Authentication required"`
            }
          });
          applyCORSHeaders(request, response, process.env.NODE_ENV as any);
          return response;
        }
      } else {
        const requestType = isConnectivityCheck ? 'connectivity check (HEAD)' : 
                           isMetadataRequest ? 'metadata request (GET)' : 
                           `discovery call: ${requestBody?.method || 'unknown'}`;
        console.log(`🔍 Allowing unauthenticated ${requestType} from ${clientIP}`);
        // Set anonymous context for discovery calls
        currentAuthContext = null;
        currentApiKeyConfig = null;
      }
      
      // Security: Additional request body validation for MCP calls
      if (requestBody && requestBody.method) {
        const toolName = requestBody.method;
        const toolParams = requestBody.params;
        
        // Validate tool-specific security
        if (toolName.includes('query') && toolParams) {
          if (toolParams.sql) {
            validateAndSanitizeQuery(toolParams.sql, 'sql');
          }
          if (toolParams.cypher) {
            validateAndSanitizeQuery(toolParams.cypher, 'cypher');
          }
        }
      }
      
      // Call the original handler with security context
      response = await originalHandler(request, context);
      
      // Apply CORS and security headers to response
      applyCORSHeaders(request, response, process.env.NODE_ENV as any);
      
      // Log successful request
      const duration = Date.now() - startTime;
      console.log(`✅ Request completed: ${request.method} ${request.url} (${duration}ms) from ${clientIP}`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Security/Request error (${duration}ms):`, error);
      
      // Determine error type and response
      const isSecurityError = error instanceof Error && (
        error.message.includes('blocked') || 
        error.message.includes('injection') ||
        error.message.includes('Security')
      );
      
      response = Response.json({
        error: isSecurityError ? "Security violation" : "Request failed",
        message: error instanceof Error ? error.message : "Request processing failed",
        code: isSecurityError ? "SECURITY_ERROR" : "REQUEST_ERROR",
        timestamp: new Date().toISOString()
      }, { status: isSecurityError ? 403 : 500 });
      
      applyCORSHeaders(request, response, process.env.NODE_ENV as any);
      return response;
    } finally {
      // Cleanup request context
      delete (globalThis as any).currentRequestIP;
      delete (globalThis as any).currentRequestUserAgent;
      // Clear authentication context
      currentApiKeyConfig = null;
      currentAuthContext = null;
    }
  };
};

// Create secured versions of the handlers with comprehensive protection
const securedHandler = createSecuredHandler(handler);

// Explicit named exports for better compatibility with Vercel
export const GET = securedHandler;
export const POST = securedHandler;
export const HEAD = securedHandler; // Handle connectivity checks
export const DELETE = securedHandler;
export const PUT = securedHandler;
export const OPTIONS = securedHandler; // Handle CORS preflight
