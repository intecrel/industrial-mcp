import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

// Usage tracking interface
interface UsageEntry {
  userId: string;
  apiKey: string;
  toolName: string;
  timestamp: number;
  params?: any;
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

// Parse API keys from environment variables
const parseApiKeys = (): ApiKeyConfig[] => {
  const keys: ApiKeyConfig[] = [];
  
  // Primary API key (backward compatibility)
  const primaryKey = process.env.API_KEY;
  if (primaryKey) {
    keys.push({
      key: primaryKey,
      userId: 'primary',
      name: 'Primary API Key',
      permissions: ['*'] // Full access
    });
  }
  
  // Multi-user API keys from environment variable
  // Format: USER1:key1:name1,USER2:key2:name2
  const multiKeys = process.env.MCP_API_KEYS;
  if (multiKeys) {
    multiKeys.split(',').forEach(keyConfig => {
      const [userId, key, name, rateLimitStr] = keyConfig.trim().split(':');
      if (userId && key) {
        keys.push({
          key: key.trim(),
          userId: userId.trim(),
          name: name?.trim() || userId,
          permissions: ['*'], // Default full access
          rateLimitPerHour: rateLimitStr ? parseInt(rateLimitStr) : undefined
        });
      }
    });
  }
  
  return keys;
};

// Get API key configuration
const getApiKeyConfig = (apiKey: string): ApiKeyConfig | null => {
  const apiKeys = parseApiKeys();
  return apiKeys.find(config => config.key === apiKey) || null;
};

// Rate limiting check
const checkRateLimit = (apiKeyConfig: ApiKeyConfig): boolean => {
  if (!apiKeyConfig.rateLimitPerHour) return true;
  
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const recentUsage = usageLog.filter(entry => 
    entry.apiKey === apiKeyConfig.key && 
    entry.timestamp > oneHourAgo
  );
  
  return recentUsage.length < apiKeyConfig.rateLimitPerHour;
};

// Log usage for analytics
const logUsage = (apiKeyConfig: ApiKeyConfig, toolName: string, params?: any) => {
  const entry: UsageEntry = {
    userId: apiKeyConfig.userId,
    apiKey: apiKeyConfig.key,
    toolName,
    timestamp: Date.now(),
    params: params ? JSON.stringify(params).substring(0, 200) : undefined // Truncate for storage
  };
  
  usageLog.push(entry);
  
  // Keep only last 1000 entries to prevent memory issues
  if (usageLog.length > 1000) {
    usageLog.splice(0, usageLog.length - 1000);
  }
  
  console.log(`📊 Usage logged: ${apiKeyConfig.userId} used ${toolName}`);
};

// Enhanced API Key validation function
const validateApiKey = (headers: any): ApiKeyConfig => {
  const apiKey = headers?.['x-api-key'] || headers?.['X-API-Key'];
  
  // Check if any API keys are configured
  const apiKeys = parseApiKeys();
  if (apiKeys.length === 0) {
    console.warn('⚠️ No API keys configured. Set API_KEY or MCP_API_KEYS environment variable.');
    throw new Error('Server configuration error: No API keys configured');
  }
  
  if (!apiKey) {
    throw new Error('API key required. Please provide x-api-key header.');
  }
  
  const apiKeyConfig = getApiKeyConfig(apiKey);
  if (!apiKeyConfig) {
    throw new Error('Invalid API key provided.');
  }
  
  // Check rate limits
  if (!checkRateLimit(apiKeyConfig)) {
    throw new Error(`Rate limit exceeded for user ${apiKeyConfig.userId}. Limit: ${apiKeyConfig.rateLimitPerHour} requests/hour.`);
  }
  
  console.log(`✅ API key validated: ${apiKeyConfig.name} (${apiKeyConfig.userId})`);
  return apiKeyConfig;
};

// Simplified tool wrapper that logs usage (authentication handled at route level)
const authenticatedTool = (toolName: string, toolFn: (params: any) => Promise<any>) => {
  return async (params: any) => {
    try {
      // Log usage for analytics if user is authenticated
      if (currentApiKeyConfig) {
        logUsage(currentApiKeyConfig, toolName, params);
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

// Global variable to store current request's API key info (for this serverless instance)
let currentApiKeyConfig: ApiKeyConfig | null = null;

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

// Create authenticated wrapper for the handler
const createAuthenticatedHandler = (originalHandler: (request: Request, context?: any) => Promise<Response>) => {
  return async (request: Request, context?: any) => {
    try {
      // Extract API key from request headers
      const apiKey = request.headers.get('x-api-key') || request.headers.get('X-API-Key');
      
      // Validate API key
      const apiKeys = parseApiKeys();
      if (apiKeys.length > 0) { // Only validate if API keys are configured
        if (!apiKey) {
          return Response.json({
            error: "API key required",
            message: "Please provide x-api-key header",
            code: "AUTHENTICATION_ERROR"
          }, { status: 401 });
        }
        
        const apiKeyConfig = getApiKeyConfig(apiKey);
        if (!apiKeyConfig) {
          return Response.json({
            error: "Invalid API key",
            message: "The provided API key is not valid",
            code: "AUTHENTICATION_ERROR"
          }, { status: 401 });
        }
        
        // Check rate limits
        if (!checkRateLimit(apiKeyConfig)) {
          return Response.json({
            error: "Rate limit exceeded",
            message: `Rate limit exceeded for user ${apiKeyConfig.userId}. Limit: ${apiKeyConfig.rateLimitPerHour} requests/hour.`,
            code: "RATE_LIMIT_ERROR"
          }, { status: 429 });
        }
        
        console.log(`✅ API key validated: ${apiKeyConfig.name} (${apiKeyConfig.userId})`);
        
        // Store authenticated user info for tools to access
        currentApiKeyConfig = apiKeyConfig;
      } else {
        console.warn('⚠️ No API keys configured - allowing unauthenticated access');
        currentApiKeyConfig = null;
      }
      
      // Call the original handler
      return await originalHandler(request, context);
    } catch (error) {
      console.error('❌ Authentication error:', error);
      return Response.json({
        error: "Authentication failed",
        message: error instanceof Error ? error.message : "Access denied",
        code: "AUTHENTICATION_ERROR"
      }, { status: 401 });
    }
  };
};

// Create authenticated versions of the handlers
const authenticatedHandler = createAuthenticatedHandler(handler);

// Explicit named exports for better compatibility with Vercel
export const GET = authenticatedHandler;
export const POST = authenticatedHandler;
export const DELETE = authenticatedHandler;
