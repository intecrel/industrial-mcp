/**
 * Secure MCP Server with OAuth 2.1 Authentication
 * JSON-RPC 2.0 implementation with Bearer token and API key authentication
 * All MCP tools require proper authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, hasToolPermission, createAuthError } from '../../../lib/oauth/auth-middleware'

// Simple echo tool handler
async function handleEchoTool(params: any) {
  console.log('🎯 ECHO TOOL CALLED:', params)
  return {
    content: [
      {
        type: "text" as const,
        text: `Echo: ${params.message || 'No message provided'}`
      }
    ]
  }
}

export async function POST(request: NextRequest) {
  console.log('🚀 SECURE MCP SERVER: Request received')
  
  try {
    const body = await request.json()
    console.log('📥 MCP Request:', JSON.stringify(body, null, 2))

    const { method, id } = body

    // Skip authentication for initialize and tools/list (discovery methods)
    const skipAuth = method === 'initialize' || method === 'tools/list'
    
    // Authenticate request (except for discovery methods)
    let authContext = null
    if (!skipAuth) {
      try {
        authContext = await authenticateRequest(request)
        console.log(`✅ Authenticated user: ${authContext.userId} via ${authContext.method}`)
      } catch (error) {
        console.log(`❌ Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32001,
            message: "Authentication required",
            data: createAuthError(error instanceof Error ? error.message : 'Authentication failed')
          }
        }, { 
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          }
        })
      }
    }

    // Handle initialize
    if (method === 'initialize') {
      console.log('✅ MCP INITIALIZE called')
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {}
          },
          serverInfo: {
            name: "Industrial MCP - Minimal",
            version: "1.0.0"
          }
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      })
    }

    // Handle tools/list
    if (method === 'tools/list') {
      console.log('📋 TOOLS/LIST called - returning 18 tools: echo + 17 comprehensive database/analytics/admin tools')
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
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
                    description: "Named parameters for the query",
                    additionalProperties: true
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
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for metrics (default: last_30_days)"
                  },
                  site_id: {
                    type: "number",
                    description: "Specific site ID to analyze"
                  },
                  goal_id: {
                    type: "number",
                    description: "Specific goal ID to analyze"
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
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for performance data (default: last_30_days)"
                  },
                  site_id: {
                    type: "number",
                    description: "Specific site ID to analyze"
                  },
                  content_type: {
                    type: "string",
                    enum: ["pages", "entry_pages", "exit_pages"],
                    description: "Type of content analysis (default: pages)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of results to return (default: 50)"
                  }
                }
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
              name: "get_company_intelligence",
              description: "Get B2B company intelligence from visitor data using enriched session data",
              inputSchema: {
                type: "object",
                properties: {
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for intelligence data (default: last_30_days)"
                  },
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
                  site_id: {
                    type: "number",
                    description: "Specific site ID for analytics filtering"
                  },
                  include_web_analytics: {
                    type: "boolean",
                    description: "Include MySQL web analytics data (default: true)"
                  },
                  include_operational_data: {
                    type: "boolean",
                    description: "Include Neo4j operational data (default: true)"
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
                  website_domain: {
                    type: "string",
                    description: "Website domain for visitor correlation"
                  },
                  date_range: {
                    type: "string",
                    enum: ["today", "yesterday", "last_7_days", "last_30_days", "current_month"],
                    description: "Date range for correlation analysis (default: last_30_days)"
                  },
                  correlation_type: {
                    type: "string",
                    enum: ["visitor_to_entity", "company_to_operations", "geographic_correlation"],
                    description: "Type of correlation analysis (default: company_to_operations)"
                  },
                  limit: {
                    type: "number",
                    description: "Maximum number of correlations to return (default: 30)"
                  }
                }
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
              name: "get_usage_analytics",
              description: "Get usage analytics and API key statistics (admin only)",
              inputSchema: {
                type: "object",
                properties: {
                  period_hours: {
                    type: "number",
                    description: "Hours to look back (default: 24)"
                  },
                  user_id: {
                    type: "string",
                    description: "Filter by specific user ID"
                  }
                }
              }
            }
          ]
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Handle tools/call
    if (method === 'tools/call') {
      console.log('🛠️ TOOLS/CALL:', body.params)
      const { name, arguments: args } = body.params

      // Check if user has permission to use this tool
      if (authContext && !hasToolPermission(authContext, name)) {
        console.log(`❌ User ${authContext.userId} does not have permission for tool: ${name}`)
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32003,
            message: "Insufficient permissions",
            data: {
              tool: name,
              required_permissions: "Tool access not granted for this user tier",
              user_permissions: authContext.permissions
            }
          }
        }, { 
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      if (name === 'echo') {
        const result = await handleEchoTool(args)
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      if (name === 'explore_database') {
        console.log('🗃️ EXPLORE_DATABASE called:', args)
        try {
          // Use the actual database explorer implementation
          const { exploreDatabaseStructure } = await import('./tools/database-explorer');
          const result = await exploreDatabaseStructure({ 
            action: args.action, 
            table_name: args.table_name, 
            limit: args.limit || 10
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Database explorer error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Database explorer error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'query_database') {
        console.log('🔍 QUERY_DATABASE called:', args)
        try {
          // Use the actual database query implementation
          const { executeCustomQuery } = await import('./tools/database-explorer');
          const result = await executeCustomQuery({ 
            query: args.query, 
            limit: args.limit || 100
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Database query error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Database query error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'analyze_data') {
        console.log('📊 ANALYZE_DATA called:', args)
        try {
          // Use the actual data analysis implementation
          const { analyzeTableData } = await import('./tools/database-explorer');
          const result = await analyzeTableData({ 
            table_name: args.table_name,
            analysis_type: args.analysis_type,
            date_column: args.date_column,
            group_by: args.group_by
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Data analysis error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Data analysis error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_cloud_sql_status') {
        console.log('☁️ GET_CLOUD_SQL_STATUS called:', args)
        try {
          // Use the actual Cloud SQL status implementation
          const { getCloudSQLStatus } = await import('./tools/cloud-sql-status');
          const result = await getCloudSQLStatus({ 
            database: args.database,
            include_details: args.include_details
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Cloud SQL status error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Cloud SQL status error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_cloud_sql_info') {
        console.log('ℹ️ GET_CLOUD_SQL_INFO called:', args)
        try {
          // Use the actual Cloud SQL info implementation
          const { getCloudSQLSystemInfo } = await import('./tools/cloud-sql-status');
          const result = await getCloudSQLSystemInfo();
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Cloud SQL info error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Cloud SQL info error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'query_knowledge_graph') {
        console.log('🕸️ QUERY_KNOWLEDGE_GRAPH called:', args)
        try {
          // Use the actual Neo4j knowledge graph implementation
          const { queryKnowledgeGraph } = await import('./tools/neo4j-knowledge-graph');
          const result = await queryKnowledgeGraph({
            query: args.query,
            parameters: args.parameters || {},
            limit: args.limit || 100
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Knowledge graph query error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Knowledge graph query error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_organizational_structure') {
        console.log('🏢 GET_ORGANIZATIONAL_STRUCTURE called:', args)
        try {
          // Use the actual organizational structure implementation
          const { getOrganizationalStructure } = await import('./tools/neo4j-knowledge-graph');
          const result = await getOrganizationalStructure({
            department: args.department,
            depth: args.depth || 3,
            include_employees: args.include_employees || false
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Organizational structure error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Organizational structure error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'find_capability_paths') {
        console.log('🛤️ FIND_CAPABILITY_PATHS called:', args)
        try {
          // Use the actual capability paths implementation
          const { findCapabilityPaths } = await import('./tools/neo4j-knowledge-graph');
          const result = await findCapabilityPaths({
            skill: args.skill,
            source_employee: args.source_employee,
            target_role: args.target_role,
            max_hops: args.max_hops || 4
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Capability paths error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Capability paths error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_visitor_analytics') {
        console.log('📈 GET_VISITOR_ANALYTICS called:', args)
        try {
          // Use the actual visitor analytics implementation
          const { getVisitorAnalytics } = await import('./tools/mysql-analytics-tools');
          const result = await getVisitorAnalytics({
            date_range: args.date_range || 'last_7_days',
            site_id: args.site_id,
            limit: args.limit || 100
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Visitor analytics error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Visitor analytics error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_conversion_metrics') {
        console.log('🎯 GET_CONVERSION_METRICS called:', args)
        try {
          // Use the actual conversion metrics implementation
          const { getConversionMetrics } = await import('./tools/mysql-analytics-tools');
          const result = await getConversionMetrics({
            date_range: args.date_range || 'last_30_days',
            site_id: args.site_id,
            goal_id: args.goal_id,
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Conversion metrics error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Conversion metrics error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_content_performance') {
        console.log('📊 GET_CONTENT_PERFORMANCE called:', args)
        try {
          // Use the actual content performance implementation
          const { getContentPerformance } = await import('./tools/mysql-analytics-tools');
          const result = await getContentPerformance({
            date_range: args.date_range || 'last_30_days',
            site_id: args.site_id,
            content_type: args.content_type || 'pages',
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Content performance error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Content performance error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      // Handle remaining analytics tools individually
      if (name === 'query_matomo_database') {
        console.log('🔍 QUERY_MATOMO_DATABASE called:', args)
        try {
          const { queryMatomoDatabase } = await import('./tools/mysql-analytics-tools');
          const result = await queryMatomoDatabase({
            query: args.query,
            parameters: args.parameters || [],
            limit: args.limit || 100
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Matomo database query error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Matomo database query error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_company_intelligence') {
        console.log('🏢 GET_COMPANY_INTELLIGENCE called:', args)
        try {
          const { getCompanyIntelligence } = await import('./tools/mysql-analytics-tools');
          const result = await getCompanyIntelligence({
            date_range: args.date_range || 'last_30_days',
            company_name: args.company_name,
            domain: args.domain,
            country: args.country,
            site_id: args.site_id,
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Company intelligence error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Company intelligence error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_unified_dashboard_data') {
        console.log('📊 GET_UNIFIED_DASHBOARD_DATA called:', args)
        try {
          const { getUnifiedDashboardData } = await import('./tools/cross-database-tools');
          const result = await getUnifiedDashboardData({
            company_name: args.company_name,
            date_range: args.date_range || 'last_30_days',
            site_id: args.site_id,
            include_web_analytics: args.include_web_analytics,
            include_operational_data: args.include_operational_data,
            limit: args.limit || 50
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Unified dashboard error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Unified dashboard error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'correlate_operational_relationships') {
        console.log('🔗 CORRELATE_OPERATIONAL_RELATIONSHIPS called:', args)
        try {
          const { correlateOperationalRelationships } = await import('./tools/cross-database-tools');
          const result = await correlateOperationalRelationships({
            entity_type: args.entity_type || 'Company',
            entity_name: args.entity_name,
            website_domain: args.website_domain,
            date_range: args.date_range || 'last_30_days',
            correlation_type: args.correlation_type || 'company_to_operations',
            limit: args.limit || 30
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Operational correlation error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Operational correlation error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_knowledge_graph_stats') {
        console.log('📈 GET_KNOWLEDGE_GRAPH_STATS called:', args)
        try {
          const { getKnowledgeGraphStats } = await import('./tools/neo4j-knowledge-graph');
          const result = await getKnowledgeGraphStats();
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Knowledge graph stats error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Knowledge graph stats error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      if (name === 'get_usage_analytics') {
        console.log('📊 GET_USAGE_ANALYTICS called:', args)
        try {
          // This tool is admin-only and simplified for now
          const result = {
            usage_analytics: {
              period_hours: args.period_hours || 24,
              user_id: args.user_id || 'all_users',
              total_requests: 0,
              unique_users: 0,
              top_tools: ['echo', 'query_database', 'get_visitor_analytics'],
              request_volume: Array.from({length: 24}, (_, i) => ({
                hour: i,
                requests: Math.floor(Math.random() * 50)
              })),
              status: 'analytics_available',
              note: 'Simplified analytics - full tracking not implemented'
            }
          };
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Usage analytics error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Usage analytics error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      // Tool not found
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Tool '${name}' not found`
        }
      }, {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Method not supported
    console.log('❌ Unsupported method:', method)
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method '${method}' not found`
      }
    }, {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('💥 MCP Error:', error)
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: 'Internal server error',
        data: error instanceof Error ? error.message : String(error)
      }
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

export async function GET(request: NextRequest) {
  console.log('📡 MCP GET request - returning server info')
  return NextResponse.json({
    name: "Industrial MCP - Minimal",
    version: "1.0.0",
    description: "Minimal MCP server with echo tool",
    tools: ["echo"],
    status: "active"
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}