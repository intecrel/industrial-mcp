import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

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
      // Tool implementation
      async ({ message }) => ({
        content: [{ type: "text", text: `Tool echo: ${message}` }],
      })
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
      async ({ action, table_name, limit = 10 }) => {
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
      }
    );
    
    // Register database query tool
    server.tool(
      "query_database",
      "Execute custom SQL queries safely with automatic query validation",
      {
        query: z.string().describe("SQL query to execute (SELECT statements only for safety)"),
        limit: z.number().optional().describe("Maximum number of rows to return (default: 100)")
      },
      async ({ query, limit = 100 }) => {
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
      }
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
      async ({ table_name, analysis_type, date_column, group_by }) => {
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
      }
    );
    
    // Register Cloud SQL status tool
    server.tool(
      "get_cloud_sql_status",
      "Get Cloud SQL database connection status and health information",
      {
        database: z.string().optional().describe("Specific database name to check (optional)"),
        include_details: z.boolean().optional().describe("Include detailed connection information")
      },
      async ({ database, include_details = false }) => {
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
      }
    );
    
    // Register Cloud SQL system info tool
    server.tool(
      "get_cloud_sql_info",
      "Get Cloud SQL system configuration and connection information",
      {},
      async () => {
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
      }
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

// Explicit named exports for better compatibility with Vercel
// This is preferred over the aliased exports syntax
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
