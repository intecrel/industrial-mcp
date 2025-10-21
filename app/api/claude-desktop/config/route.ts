/**
 * Claude Desktop MCP Configuration Endpoint
 * Provides configuration for Claude Desktop's native MCP connector support
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../../lib/oauth/config';
import { SUPPORTED_SCOPES } from '../../../../lib/oauth/scopes';

export async function GET(request: NextRequest) {
  try {
    const config = getOAuthConfig();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const authType = searchParams.get('auth') || 'oauth'; // oauth or apikey

    // Claude Desktop MCP Configuration
    const claudeDesktopConfig = {
      mcpServers: {
        "industrial-mcp": {
          // Server identification
          name: "Industrial MCP Server",
          description: "Advanced MCP server with Neo4j knowledge graph and MySQL analytics",
          
          // Option 1: Use existing bridge script (Recommended)
          command: "node",
          args: ["./industrial-mcp-bridge-prod.js"],
          env: {
            MCP_SERVER_URL: `${config.issuer}/api/mcp`,
            MCP_API_KEY: authType === 'apikey' ? "YOUR_API_KEY_HERE" : undefined,
            MCP_OAUTH_TOKEN: authType === 'oauth' ? "YOUR_ACCESS_TOKEN_HERE" : undefined,
            DEBUG: "false"
          },
          
          // Option 2: Custom connector (if Claude Desktop supports direct HTTP)
          custom_connector: {
            type: "http",
            url: `${config.issuer}/api/mcp`,
            headers: authType === 'oauth' ? {
              "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE"
            } : {
              "x-api-key": "YOUR_API_KEY_HERE"
            }
          }
        }
      },
      
      // Claude Desktop Settings
      settings: {
        // UI preferences
        theme: "system",
        
        // MCP preferences  
        mcp: {
          enabled: true,
          autoConnect: true,
          timeout: 30000
        }
      },
      
      // Setup instructions specific to Claude Desktop
      setup: {
        installation: {
          title: "Add to Claude Desktop",
          steps: [
            {
              step: 1,
              title: "Open Claude Desktop Settings",
              description: "Go to Settings > Custom Connectors or MCP Servers"
            },
            {
              step: 2,
              title: "Add New MCP Server",
              description: "Click 'Add Server' and enter the configuration"
            },
            {
              step: 3,
              title: "Configure Authentication",
              description: authType === 'oauth' ?
                "Set up OAuth 2.1 authentication with the provided endpoints" :
                "Enter your API key in the x-api-key header"
            },
            {
              step: 4,
              title: "Test Connection",
              description: "Verify the server connection and available tools"
            }
          ]
        },
        
        authentication: authType === 'oauth' ? {
          type: "OAuth 2.1",
          client_id: "claude-desktop",
          authorization_url: `${config.issuer}/api/oauth/authorize`,
          token_url: `${config.issuer}/api/oauth/token`,
          scope: "read:analytics read:knowledge admin:usage",
          redirect_uri: "http://localhost", // Claude Desktop can handle localhost
          instructions: [
            "Claude Desktop will open your browser for OAuth authorization",
            "Authorize the connection with Industrial MCP Server",
            "Claude Desktop will automatically receive the access token"
          ]
            } : {
          type: "API Key",
          headers: {
            "x-api-key": "Your API key from .env.local"
          },
          instructions: [
            "Get your API key from the server administrator",
            "Add the API key to the MCP server configuration headers"
          ]
        }
      },
      
      // Available capabilities
      capabilities: {
        tools: Object.entries(SUPPORTED_SCOPES).reduce((acc, [scope, info]) => {
          acc[scope] = {
            description: info.description,
            tools: info.tools.map(tool => ({
              name: tool,
              description: getToolDescription(tool)
            }))
          };
          return acc;
        }, {} as Record<string, any>),
        
        databases: [
          {
            name: "Neo4j Knowledge Graph",
            type: "graph",
            description: "Industrial and organizational data with relationship mapping",
            entities: ["Company", "Employee", "Machine", "Process", "Service", "Location"],
            sample_queries: [
              "Find all employees with specific skills",
              "Map organizational hierarchy",
              "Discover capability paths between roles"
            ]
          },
          {
            name: "MySQL Analytics (Matomo)", 
            type: "relational",
            description: "Web analytics and visitor behavior data",
            tables: "108+ tables with visitor tracking, conversion data, and company intelligence",
            sample_queries: [
              "Analyze visitor traffic patterns",
              "Track conversion funnel performance",
              "Generate company intelligence reports"
            ]
          }
        ]
      },
      
      // System information
      system: {
        server_url: config.issuer,
        mcp_version: "2024-10-07",
        oauth_version: "2.1",
        status: "operational",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    };

    // Return in requested format
    if (format === 'claude-desktop-json') {
      // Simplified format for direct Claude Desktop configuration
      const simpleConfig = {
        mcpServers: {
          "industrial-mcp": {
            command: "curl",
            args: [
              "-X", "POST",
              "-H", "Content-Type: application/json",
              "-H", `Authorization: Bearer YOUR_TOKEN_HERE`,
              `${config.issuer}/api/mcp`
            ],
            env: {
              INDUSTRIAL_MCP_URL: config.issuer
            }
          }
        }
      };

      return NextResponse.json(simpleConfig, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="claude-desktop-mcp.json"'
        }
      });
    }

    console.log(`📋 Claude Desktop MCP configuration requested (auth: ${authType})`);

    return NextResponse.json(claudeDesktopConfig, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('❌ Error generating Claude Desktop config:', error);
    return NextResponse.json(
      { 
        error: 'configuration_error', 
        message: 'Failed to generate Claude Desktop configuration',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Helper function to get tool descriptions
function getToolDescription(toolName: string): string {
  const descriptions: Record<string, string> = {
    'echo': 'Echo back a message for testing',
    'explore_database': 'Explore database structure and schemas',
    'query_database': 'Execute custom SQL queries safely',
    'analyze_data': 'Generate analytics insights from data',
    'get_cloud_sql_status': 'Check Cloud SQL database status',
    'get_cloud_sql_info': 'Get Cloud SQL system information',
    'query_knowledge_graph': 'Execute Cypher queries on Neo4j',
    'get_organizational_structure': 'Retrieve org hierarchy and departments',
    'find_capability_paths': 'Find skill networks and career paths',
    'get_knowledge_graph_stats': 'Get knowledge graph statistics',
    'query_matomo_database': 'Query Matomo analytics database',
    'get_visitor_analytics': 'Analyze website visitor behavior',
    'get_conversion_metrics': 'Track conversion and goal metrics',
    'get_content_performance': 'Analyze content and page performance',
    'get_company_intelligence': 'Extract B2B company insights',
    'get_usage_analytics': 'Monitor API usage statistics',
    'get_unified_dashboard_data': 'Combine data from multiple databases',
    'correlate_operational_relationships': 'Cross-database relationship analysis'
  };

  return descriptions[toolName] || 'MCP tool for data operations';
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}