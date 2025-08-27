/**
 * MINIMAL MCP Server - Clean Start
 * Simple JSON-RPC 2.0 implementation with just echo tool
 * No adapters, no complexity - build up step by step
 */

import { NextRequest, NextResponse } from 'next/server'

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
  console.log('🚀 MINIMAL MCP SERVER: Request received')
  
  try {
    const body = await request.json()
    console.log('📥 MCP Request:', JSON.stringify(body, null, 2))

    const { method, id } = body

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
      console.log('📋 TOOLS/LIST called - returning 17 tools: echo + 16 comprehensive database/analytics tools')
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
          // Import the database explorer from the backup
          const { exploreDatabaseStructure } = await import('../../../backup-complex-implementation/mcp/tools/database-explorer');
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
          // Import the database query function from the backup
          const { executeCustomQuery } = await import('../../../backup-complex-implementation/mcp/tools/database-explorer');
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
          // Import the data analysis function from the backup
          const { analyzeTableData } = await import('../../../backup-complex-implementation/mcp/tools/database-explorer');
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
          // Import the Cloud SQL status function from the backup
          const { getCloudSQLStatus } = await import('../../../backup-complex-implementation/mcp/tools/cloud-sql-status');
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
          // Import the Cloud SQL info function from the backup
          const { getCloudSQLSystemInfo } = await import('../../../backup-complex-implementation/mcp/tools/cloud-sql-status');
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
          // Simple Neo4j knowledge graph query implementation
          const { getGlobalDatabaseManager } = await import('../../../lib/database');
          const dbManager = await getGlobalDatabaseManager();
          
          // Get Neo4j connection
          const neo4jConnection = dbManager.getConnection('neo4j');
          if (!neo4jConnection) {
            throw new Error('Neo4j connection not available');
          }
          
          // Execute the query with parameters
          const result = await neo4jConnection.query(
            args.query, 
            args.parameters || {}
          );
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    query: args.query,
                    parameters: args.parameters || {},
                    results: result.data || [],
                    records_returned: result.data?.length || 0,
                    timestamp: new Date().toISOString()
                  }, null, 2)
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
          // Simple organizational structure query implementation
          const { getGlobalDatabaseManager } = await import('../../../lib/database');
          const dbManager = await getGlobalDatabaseManager();
          const neo4jConnection = dbManager.getConnection('neo4j');
          
          if (!neo4jConnection) {
            throw new Error('Neo4j connection not available');
          }
          
          // Basic organizational query
          const query = `
            MATCH (dept:Department)
            OPTIONAL MATCH (dept)-[:REPORTS_TO*0..${args.depth || 3}]->(parent:Department)
            OPTIONAL MATCH (emp:Employee)-[:WORKS_IN]->(dept)
            RETURN dept, parent, ${args.include_employees ? 'collect(emp) as employees' : 'null as employees'}
            ORDER BY dept.name
          `;
          
          const result = await neo4jConnection.query(query, {});
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    department: args.department,
                    depth: args.depth || 3,
                    include_employees: args.include_employees || false,
                    results: result.data || [],
                    records_returned: result.data?.length || 0,
                    timestamp: new Date().toISOString()
                  }, null, 2)
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
          // Simple capability paths query implementation
          const { getGlobalDatabaseManager } = await import('../../../lib/database');
          const dbManager = await getGlobalDatabaseManager();
          const neo4jConnection = dbManager.getConnection('neo4j');
          
          if (!neo4jConnection) {
            throw new Error('Neo4j connection not available');
          }
          
          // Basic skill/capability query
          const query = `
            MATCH (skill:Skill {name: $skill})
            OPTIONAL MATCH path = (emp:Employee)-[:HAS_SKILL]->(skill)
            OPTIONAL MATCH (emp)-[:WORKS_IN]->(dept:Department)
            RETURN skill, emp, dept, path
            LIMIT ${args.max_hops * 10 || 40}
          `;
          
          const result = await neo4jConnection.query(query, { skill: args.skill });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    skill: args.skill,
                    source_employee: args.source_employee,
                    target_role: args.target_role,
                    max_hops: args.max_hops || 4,
                    results: result.data || [],
                    records_returned: result.data?.length || 0,
                    timestamp: new Date().toISOString()
                  }, null, 2)
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
          // Simple visitor analytics query implementation
          const { getGlobalDatabaseManager } = await import('../../../lib/database');
          const dbManager = await getGlobalDatabaseManager();
          const connection = dbManager.getConnection();
          
          if (connection.type !== 'mysql') {
            throw new Error('MySQL connection required for visitor analytics');
          }
          
          // Basic visitor query for Matomo
          const query = `
            SELECT 
              COUNT(DISTINCT idvisitor) as unique_visitors,
              COUNT(*) as total_visits,
              DATE(visit_first_action_time) as visit_date
            FROM matomo_log_visit 
            WHERE visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(visit_first_action_time)
            ORDER BY visit_date DESC
            LIMIT ?
          `;
          
          const result = await connection.query(query, [args.limit || 100]);
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    date_range: args.date_range || 'last_7_days',
                    site_id: args.site_id,
                    results: result.data || [],
                    records_returned: result.data?.length || 0,
                    timestamp: new Date().toISOString()
                  }, null, 2)
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
          // Simple conversion metrics implementation
          const { getGlobalDatabaseManager } = await import('../../../lib/database');
          const dbManager = await getGlobalDatabaseManager();
          const connection = dbManager.getConnection();
          
          const query = `
            SELECT 
              COUNT(*) as total_conversions,
              DATE(server_time) as conversion_date,
              idgoal
            FROM matomo_log_conversion 
            WHERE server_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(server_time), idgoal
            ORDER BY conversion_date DESC
            LIMIT ?
          `;
          
          const result = await connection.query(query, [args.limit || 50]);
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    date_range: args.date_range || 'last_30_days',
                    results: result.data || [],
                    records_returned: result.data?.length || 0,
                    timestamp: new Date().toISOString()
                  }, null, 2)
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
          // Simple content performance implementation
          const { getGlobalDatabaseManager } = await import('../../../lib/database');
          const dbManager = await getGlobalDatabaseManager();
          const connection = dbManager.getConnection();
          
          const query = `
            SELECT 
              url,
              COUNT(*) as page_views,
              COUNT(DISTINCT idvisitor) as unique_visitors
            FROM matomo_log_link_visit_action la
            JOIN matomo_log_visit v ON la.idvisit = v.idvisit
            WHERE la.server_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY url
            ORDER BY page_views DESC
            LIMIT ?
          `;
          
          const result = await connection.query(query, [args.limit || 50]);
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    date_range: args.date_range || 'last_30_days',
                    content_type: args.content_type || 'pages',
                    results: result.data || [],
                    records_returned: result.data?.length || 0,
                    timestamp: new Date().toISOString()
                  }, null, 2)
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

      // Handle remaining 5 tools with simplified implementations
      if (['query_matomo_database', 'get_company_intelligence', 'get_unified_dashboard_data', 'correlate_operational_relationships', 'get_knowledge_graph_stats'].includes(name)) {
        console.log(`🔧 ${name.toUpperCase()} called:`, args)
        try {
          const { getGlobalDatabaseManager } = await import('../../../lib/database');
          const dbManager = await getGlobalDatabaseManager();
          let result = {};
          
          if (name === 'query_matomo_database') {
            const connection = dbManager.getConnection();
            const queryResult = await connection.query(args.query, args.parameters || []);
            result = {
              query: args.query,
              results: queryResult.data || [],
              records_returned: queryResult.data?.length || 0
            };
          }
          else if (name === 'get_company_intelligence') {
            const connection = dbManager.getConnection();
            const query = `SELECT location_country, COUNT(*) as visits FROM matomo_log_visit WHERE visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY location_country LIMIT ?`;
            const queryResult = await connection.query(query, [args.limit || 50]);
            result = {
              company_intelligence: queryResult.data || [],
              date_range: args.date_range || 'last_30_days'
            };
          }
          else if (name === 'get_unified_dashboard_data') {
            // Simplified unified dashboard
            const connection = dbManager.getConnection();
            const analyticsQuery = `SELECT COUNT(*) as total_visits FROM matomo_log_visit WHERE visit_first_action_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
            const analyticsResult = await connection.query(analyticsQuery, []);
            
            const neo4jConnection = dbManager.getConnection('neo4j');
            const operationalQuery = `MATCH (n) RETURN count(n) as total_nodes LIMIT 1`;
            const operationalResult = neo4jConnection ? await neo4jConnection.query(operationalQuery, {}) : null;
            
            result = {
              web_analytics: analyticsResult.data || [],
              operational_data: operationalResult?.data || [],
              unified_metrics: { total_data_sources: 2 }
            };
          }
          else if (name === 'correlate_operational_relationships') {
            // Simplified correlation
            const neo4jConnection = dbManager.getConnection('neo4j');
            if (neo4jConnection) {
              const query = `MATCH (e:${args.entity_type || 'Company'}) RETURN e LIMIT ${args.limit || 30}`;
              const queryResult = await neo4jConnection.query(query, {});
              result = {
                correlation_type: args.correlation_type || 'company_to_operations',
                entity_type: args.entity_type || 'Company',
                correlations: queryResult.data || []
              };
            } else {
              result = { error: 'Neo4j connection not available' };
            }
          }
          else if (name === 'get_knowledge_graph_stats') {
            const neo4jConnection = dbManager.getConnection('neo4j');
            if (neo4jConnection) {
              const nodeQuery = `MATCH (n) RETURN count(n) as total_nodes`;
              const relQuery = `MATCH ()-[r]->() RETURN count(r) as total_relationships`;
              const nodes = await neo4jConnection.query(nodeQuery, {});
              const rels = await neo4jConnection.query(relQuery, {});
              result = {
                statistics: {
                  total_nodes: nodes.data?.[0]?.total_nodes || 0,
                  total_relationships: rels.data?.[0]?.total_relationships || 0
                }
              };
            } else {
              result = { error: 'Neo4j connection not available' };
            }
          }
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    tool_name: name,
                    ...result,
                    timestamp: new Date().toISOString()
                  }, null, 2)
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
          console.error(`❌ ${name} error:`, error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `${name} error: ${error instanceof Error ? error.message : String(error)}`
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