/**
 * Direct MCP endpoint route
 * This is a standalone MCP endpoint that uses the Vercel MCP adapter directly
 * No longer forwards to [transport] to prevent infinite loops
 */

import { NextRequest, NextResponse } from 'next/server';

// CRITICAL FIX: Simple test endpoint to break the infinite loop
// This replaces the forwarding logic that was causing the 508 errors

export async function GET(request: NextRequest) {
  console.log('🔍 Direct /api/mcp GET request received');
  console.log(`📋 User-Agent: ${request.headers.get('user-agent')}`);
  console.log(`🔐 Auth: ${request.headers.get('authorization') ? 'Bearer token present' : 'No auth header'}`);
  
  return NextResponse.json({
    message: "MCP endpoint working - no more infinite loop!",
    method: "GET",
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: NextRequest) {
  console.log('🔍 Direct /api/mcp POST request received');
  console.log(`📋 User-Agent: ${request.headers.get('user-agent')}`);
  console.log(`🔐 Auth: ${request.headers.get('authorization') ? 'Bearer token present' : 'No auth header'}`);
  
  const url = new URL(request.url);
  console.log(`🌐 Full URL: ${url.toString()}`);
  console.log(`📍 Pathname: ${url.pathname}`);
  console.log(`❓ Search params: ${url.search}`);
  
  try {
    const body = await request.json();
    console.log('📋 MCP Request:', { method: body.method, id: body.id });
    console.log('🔍 Full request body:', JSON.stringify(body, null, 2));
    
    // Log every single method we receive
    console.log(`🎯 Processing MCP method: ${body.method}`);
    
    // Quick test response for debugging
    if (body.method === 'ping') {
      console.log('🏓 Ping received - responding immediately');
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { message: "pong", timestamp: new Date().toISOString() }
      });
    }
    
    // Handle MCP initialize method with proper response format
    if (body.method === 'initialize') {
      console.log('🔧 Handling MCP initialize request');
      console.log(`📋 Claude.ai protocol version: ${body.params?.protocolVersion}`);
      console.log('📋 Responding with matching protocol version: 2025-06-18');
      console.log('📋 Advertising tool capabilities to Claude.ai with explicit tool support');
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {
              echo: {
                description: "Echo back messages for testing connectivity",
              },
              explore_database: {
                description: "Explore database structure and discover data",
              },
              query_knowledge_graph: {
                description: "Execute Cypher queries against the knowledge graph",
              }
            },
            resources: {},
            prompts: {},
            logging: {}
          },
          serverInfo: {
            name: "Industrial MCP Server",
            version: "2.0.0"
          },
          instructions: "Industrial MCP server with Neo4j knowledge graph and MySQL analytics tools ready for use."
        }
      });
    }
    
    // Handle tools/list method
    if (body.method === 'tools/list') {
      const startTime = Date.now();
      console.log('🎯🎯🎯 CLAUDE.AI IS CALLING TOOLS/LIST! - This is the key request we were waiting for!');
      console.log('🔧 Handling tools/list request - returning simplified tools for timeout debugging');
      
      // Simplified response to test timeout issues
      const response = NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "echo",
              description: "Echo back the provided message",
              inputSchema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "The message to echo back"
                  }
                },
                required: ["message"]
              }
            },
            {
              name: "explore_database",
              description: "Explore database structure - list tables, inspect schemas, and discover data",
              inputSchema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["list_tables", "describe_table", "sample_data"],
                    description: "What to explore: list_tables, describe_table, or sample_data"
                  }
                },
                required: ["action"]
              }
            },
            {
              name: "query_knowledge_graph",
              description: "Execute parameterized Cypher queries against the knowledge graph",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Cypher query to execute"
                  }
                },
                required: ["query"]
              }
            }
          ]
        }
      });
      
      const endTime = Date.now();
      console.log(`✅ Returning simplified tools/list response with 3 tools (took ${endTime - startTime}ms)`);
      return response;
    }
    
    // Handle full tools/list method (if we need it later)  
    if (body.method === 'tools/list-full') {
      const startTime = Date.now();
      console.log('🔧 Handling FULL tools/list request - returning all 17 tools');
      
      const response = NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "echo",
              description: "Echo back the provided message",
              inputSchema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "The message to echo back"
                  }
                },
                required: ["message"]
              }
            },
            {
              name: "explore_database",
              description: "Explore database structure - list tables, inspect schemas, and discover data",
              inputSchema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["list_tables", "describe_table", "sample_data"],
                    description: "What to explore: list_tables, describe_table, or sample_data"
                  },
                  table_name: {
                    type: "string",
                    description: "Table name (required for describe_table and sample_data)"
                  },
                  limit: {
                    type: "number",
                    description: "Number of sample rows to return (default: 10)"
                  }
                },
                required: ["action"]
              }
            },
            {
              name: "query_database",
              description: "Execute custom SQL queries safely with automatic query validation",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "SQL query to execute (SELECT statements only for safety)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of rows to return (default: 100)"
                  }
                },
                required: ["query"]
              }
            },
            {
              name: "analyze_data",
              description: "Generate analytics insights from database tables with common patterns",
              inputSchema: {
                type: "object",
                properties: {
                  table_name: {
                    type: "string",
                    description: "Table name to analyze"
                  },
                  analysis_type: {
                    type: "string",
                    enum: ["summary", "trends", "distribution"],
                    description: "Type of analysis: summary, trends, or distribution"
                  },
                  date_column: {
                    type: "string",
                    description: "Date/timestamp column name for trend analysis"
                  },
                  group_by: {
                    type: "string",
                    description: "Column to group by for distribution analysis"
                  }
                },
                required: ["table_name", "analysis_type"]
              }
            },
            {
              name: "get_cloud_sql_status",
              description: "Get Cloud SQL database connection status and health information",
              inputSchema: {
                type: "object",
                properties: {
                  database: {
                    type: "string",
                    description: "Specific database name to check (optional)"
                  },
                  include_details: {
                    type: "boolean",
                    description: "Include detailed connection information"
                  }
                }
              }
            },
            {
              name: "get_cloud_sql_info",
              description: "Get Cloud SQL system configuration and connection information",
              inputSchema: {
                type: "object",
                properties: {}
              }
            },
            {
              name: "query_knowledge_graph",
              description: "Execute parameterized Cypher queries against the knowledge graph with injection prevention",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Cypher query to execute (read-only operations only)"
                  },
                  parameters: {
                    type: "object",
                    description: "Named parameters for the query"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return (default: 100)"
                  }
                },
                required: ["query"]
              }
            },
            {
              name: "get_organizational_structure",
              description: "Get organizational structure including departments and reporting hierarchies from the knowledge graph",
              inputSchema: {
                type: "object",
                properties: {
                  department: {
                    type: "string",
                    description: "Specific department name or ID to focus on"
                  },
                  depth: {
                    type: "number",
                    description: "Maximum hierarchy depth to traverse (default: 3)"
                  },
                  include_employees: {
                    type: "boolean",
                    description: "Include employee information (default: false)"
                  }
                }
              }
            },
            {
              name: "find_capability_paths",
              description: "Find capability paths and skill networks within the organization using knowledge graph analysis",
              inputSchema: {
                type: "object",
                properties: {
                  skill: {
                    type: "string",
                    description: "Target skill to analyze paths for"
                  },
                  source_employee: {
                    type: "string",
                    description: "Starting employee name or ID for path analysis"
                  },
                  target_role: {
                    type: "string",
                    description: "Target role or position to find paths to"
                  },
                  max_hops: {
                    type: "number",
                    description: "Maximum relationship hops to traverse (default: 4)"
                  }
                },
                required: ["skill"]
              }
            },
            {
              name: "get_knowledge_graph_stats",
              description: "Get knowledge graph statistics and health information including node/relationship counts",
              inputSchema: {
                type: "object",
                properties: {}
              }
            },
            {
              name: "query_matomo_database",
              description: "Execute secure parameterized Matomo database queries with injection prevention",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "SQL query to execute (SELECT statements only, must target matomo_ tables)"
                  },
                  parameters: {
                    type: "array",
                    description: "Named parameters for the query"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of rows to return (default: 100)"
                  }
                },
                required: ["query"]
              }
            },
            {
              name: "get_visitor_analytics",
              description: "Get visitor analytics including traffic patterns and user behavior from Matomo",
              inputSchema: {
                type: "object",
                properties: {
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for analytics (default: last_7_days)"
                  },
                  site_id: {
                    type: "number",
                    description: "Specific site ID to analyze"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return (default: 100)"
                  }
                }
              }
            },
            {
              name: "get_conversion_metrics",
              description: "Get conversion metrics including goal tracking and funnel analysis from Matomo",
              inputSchema: {
                type: "object",
                properties: {
                  site_id: {
                    type: "number",
                    description: "Specific site ID to analyze"
                  },
                  goal_id: {
                    type: "number",
                    description: "Specific goal ID to analyze"
                  },
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for metrics (default: last_30_days)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return (default: 50)"
                  }
                }
              }
            },
            {
              name: "get_content_performance",
              description: "Get content performance including page views, bounce rates, and engagement from Matomo",
              inputSchema: {
                type: "object",
                properties: {
                  site_id: {
                    type: "number",
                    description: "Specific site ID to analyze"
                  },
                  content_type: {
                    type: "string",
                    enum: ["pages", "entry_pages", "exit_pages"],
                    description: "Type of content analysis (default: pages)"
                  },
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for performance data (default: last_30_days)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return (default: 50)"
                  }
                }
              }
            },
            {
              name: "get_company_intelligence",
              description: "Get B2B company intelligence from visitor data using enriched session data",
              inputSchema: {
                type: "object",
                properties: {
                  company_name: {
                    type: "string",
                    description: "Filter by company name (partial match)"
                  },
                  domain: {
                    type: "string",
                    description: "Filter by company domain"
                  },
                  country: {
                    type: "string",
                    description: "Filter by company country"
                  },
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for intelligence data (default: last_30_days)"
                  },
                  site_id: {
                    type: "number",
                    description: "Specific site ID to analyze"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of companies to return (default: 50)"
                  }
                }
              }
            },
            {
              name: "get_unified_dashboard_data",
              description: "Get unified dashboard data combining metrics from both Neo4j (industrial) and MySQL (analytics) databases",
              inputSchema: {
                type: "object",
                properties: {
                  company_name: {
                    type: "string",
                    description: "Filter by company name for cross-database correlation"
                  },
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for analytics data (default: last_30_days)"
                  },
                  include_operational_data: {
                    type: "boolean",
                    description: "Include Neo4j operational data (default: true)"
                  },
                  include_web_analytics: {
                    type: "boolean",
                    description: "Include MySQL web analytics data (default: true)"
                  },
                  site_id: {
                    type: "number",
                    description: "Specific site ID for analytics filtering"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results per data source (default: 50)"
                  }
                }
              }
            },
            {
              name: "correlate_operational_relationships",
              description: "Correlate operational relationships with web analytics data across Neo4j and MySQL databases",
              inputSchema: {
                type: "object",
                properties: {
                  entity_type: {
                    type: "string",
                    enum: ["Machine", "Process", "Service", "Company", "Location"],
                    description: "Type of operational entity to correlate (default: Company)"
                  },
                  entity_name: {
                    type: "string",
                    description: "Specific entity name to correlate"
                  },
                  correlation_type: {
                    type: "string",
                    enum: ["visitor_to_entity", "company_to_operations", "geographic_correlation"],
                    description: "Type of correlation analysis (default: company_to_operations)"
                  },
                  website_domain: {
                    type: "string",
                    description: "Website domain for visitor correlation"
                  },
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for correlation analysis (default: last_30_days)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of correlations to return (default: 30)"
                  }
                }
              }
            }
          ]
        }
      });
      
      const endTime = Date.now();
      console.log(`✅ Returning FULL tools/list response with 17 tools (took ${endTime - startTime}ms)`);
      return response;
    }
    
    // Handle tools/call method
    if (body.method === 'tools/call') {
      console.log('🔧 Handling tools/call request:', body.params?.name);
      const toolName = body.params?.name;
      const args = body.params?.arguments || {};
      
      try {
        // Handle echo tool
        if (toolName === 'echo') {
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Echo: ${args.message || 'No message provided'}`
                }
              ]
            }
          });
        }
        
        // Handle database exploration tools
        if (toolName === 'explore_database') {
          const { exploreDatabaseStructure } = await import('../mcp/tools/database-explorer');
          const result = await exploreDatabaseStructure({ 
            action: args.action, 
            table_name: args.table_name, 
            limit: args.limit || 10
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'query_database') {
          const { executeCustomQuery } = await import('../mcp/tools/database-explorer');
          const result = await executeCustomQuery({ 
            query: args.query, 
            limit: args.limit || 100 
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'analyze_data') {
          const { analyzeTableData } = await import('../mcp/tools/database-explorer');
          const result = await analyzeTableData({ 
            table_name: args.table_name,
            analysis_type: args.analysis_type,
            date_column: args.date_column,
            group_by: args.group_by
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_cloud_sql_status') {
          const { getCloudSQLStatus } = await import('../mcp/tools/cloud-sql-status');
          const result = await getCloudSQLStatus({ 
            database: args.database,
            include_details: args.include_details
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_cloud_sql_info') {
          const { getCloudSQLSystemInfo } = await import('../mcp/tools/cloud-sql-status');
          const result = await getCloudSQLSystemInfo();
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        // Handle Neo4j knowledge graph tools
        if (toolName === 'query_knowledge_graph') {
          const { queryKnowledgeGraph } = await import('../mcp/tools/neo4j-knowledge-graph');
          const result = await queryKnowledgeGraph({ 
            query: args.query,
            parameters: args.parameters || {},
            limit: args.limit || 100
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_organizational_structure') {
          const { getOrganizationalStructure } = await import('../mcp/tools/neo4j-knowledge-graph');
          const result = await getOrganizationalStructure({ 
            department: args.department,
            depth: args.depth || 3,
            includeEmployees: args.include_employees || false
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'find_capability_paths') {
          const { findCapabilityPaths } = await import('../mcp/tools/neo4j-knowledge-graph');
          const result = await findCapabilityPaths({ 
            skill: args.skill,
            sourceEmployee: args.source_employee,
            targetRole: args.target_role,
            maxHops: args.max_hops || 4
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_knowledge_graph_stats') {
          const { getKnowledgeGraphStats } = await import('../mcp/tools/neo4j-knowledge-graph');
          const result = await getKnowledgeGraphStats();
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        // Handle Matomo analytics tools
        if (toolName === 'query_matomo_database') {
          const { queryMatomoDatabase } = await import('../mcp/tools/mysql-analytics-tools');
          const result = await queryMatomoDatabase({ 
            query: args.query,
            parameters: args.parameters || [],
            limit: args.limit || 100
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_visitor_analytics') {
          const { getVisitorAnalytics } = await import('../mcp/tools/mysql-analytics-tools');
          const result = await getVisitorAnalytics({ 
            date_range: args.date_range || 'last_7_days',
            site_id: args.site_id,
            limit: args.limit || 100
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_conversion_metrics') {
          const { getConversionMetrics } = await import('../mcp/tools/mysql-analytics-tools');
          const result = await getConversionMetrics({ 
            site_id: args.site_id,
            goal_id: args.goal_id,
            date_range: args.date_range || 'last_30_days',
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_content_performance') {
          const { getContentPerformance } = await import('../mcp/tools/mysql-analytics-tools');
          const result = await getContentPerformance({ 
            site_id: args.site_id,
            content_type: args.content_type || 'pages',
            date_range: args.date_range || 'last_30_days',
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'get_company_intelligence') {
          const { getCompanyIntelligence } = await import('../mcp/tools/mysql-analytics-tools');
          const result = await getCompanyIntelligence({ 
            company_name: args.company_name,
            domain: args.domain,
            country: args.country,
            date_range: args.date_range || 'last_30_days',
            site_id: args.site_id,
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        // Note: get_usage_analytics tool removed - function does not exist
        
        if (toolName === 'get_unified_dashboard_data') {
          const { getUnifiedDashboardData } = await import('../mcp/tools/cross-database-tools');
          const result = await getUnifiedDashboardData({ 
            company_name: args.company_name,
            date_range: args.date_range || 'last_30_days',
            include_operational_data: args.include_operational_data !== false,
            include_web_analytics: args.include_web_analytics !== false,
            site_id: args.site_id,
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        if (toolName === 'correlate_operational_relationships') {
          const { correlateOperationalRelationships } = await import('../mcp/tools/cross-database-tools');
          const result = await correlateOperationalRelationships({ 
            entity_type: args.entity_type || 'Company',
            entity_name: args.entity_name,
            correlation_type: args.correlation_type || 'company_to_operations',
            website_domain: args.website_domain,
            date_range: args.date_range || 'last_30_days',
            limit: args.limit || 30
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        }
        
        // Unknown tool
        return NextResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`
          }
        });
        
      } catch (error) {
        console.error(`❌ Error executing tool ${toolName}:`, error);
        return NextResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32603,
            message: `Internal error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        });
      }
    }
    
    // Handle resources/list method
    if (body.method === 'resources/list') {
      console.log('🔧 Handling resources/list request');
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          resources: []
        }
      });
    }
    
    // Handle prompts/list method
    if (body.method === 'prompts/list') {
      console.log('🔧 Handling prompts/list request');
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          prompts: []
        }
      });
    }
    
    // Handle notifications/initialized method
    if (body.method === 'notifications/initialized') {
      console.log('🔧 Handling notifications/initialized');
      console.log('🎯 INITIALIZATION COMPLETE - Claude.ai should now call tools/list');
      console.log('⏱️  Starting 10-second countdown to detect tools/list call...');
      
      // Set a timer to check if tools/list gets called within 10 seconds
      setTimeout(() => {
        console.log('⏱️  10 seconds elapsed since initialization - checking if tools/list was called');
        console.log('🔍 If no tools/list call logged above this message, then the issue is confirmed');
      }, 10000);
      
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {}
      });
    }
    
    // Handle other MCP methods with generic response
    console.log('📝 Handling generic MCP method:', body.method);
    console.log('❓ UNHANDLED METHOD - This might be tools/list or another important method!');
    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        message: `MCP method ${body.method} received successfully - server is working!`,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: "Parse error"
      }
    }, { status: 400 });
  }
}

export async function OPTIONS(request: NextRequest) {
  console.log('🔍 Direct /api/mcp OPTIONS request received');
  
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-mac-address',
      'Access-Control-Max-Age': '86400',
    },
  });
}