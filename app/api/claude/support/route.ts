/**
 * Claude.ai Integration Support Endpoint
 * Provides documentation and troubleshooting information
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../../lib/oauth/config';
import { SUPPORTED_SCOPES } from '../../../../lib/oauth/scopes';

export async function GET(request: NextRequest) {
  try {
    const config = getOAuthConfig();
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section') || 'overview';

    const supportInfo = {
      overview: {
        title: "Claude.ai Integration Support",
        description: "Complete guide for integrating Industrial MCP with Claude.ai",
        server_info: {
          name: "Industrial MCP Server",
          version: "1.0.0",
          oauth_version: "2.1",
          mcp_version: "2024-10-07",
          databases: ["Neo4j Knowledge Graph", "MySQL Analytics (Matomo)"],
          total_tools: 18
        }
      },

      setup: {
        title: "Step-by-Step Setup Guide",
        steps: [
          {
            step: 1,
            title: "Get Configuration",
            description: "Retrieve the Claude.ai configuration",
            action: `GET ${config.issuer}/api/claude/config`,
            expected: "JSON configuration with MCP and OAuth settings"
          },
          {
            step: 2,
            title: "Register OAuth Client (Optional)",
            description: "If using custom client, register with our OAuth server",
            action: `POST ${config.issuer}/api/oauth/register`,
            payload: {
              client_name: "My Claude.ai Connector",
              redirect_uris: ["https://claude.ai/oauth/callback"],
              grant_types: ["authorization_code"],
              response_types: ["code"],
              scope: "read:analytics read:knowledge"
            },
            note: "Pre-configured 'claude-web' client is available"
          },
          {
            step: 3,
            title: "Configure Claude.ai",
            description: "Add Industrial MCP as a custom connector in Claude.ai",
            configuration: {
              server_type: "Remote MCP Server",
              endpoint: `${config.issuer}/api/mcp`,
              auth_type: "OAuth 2.1",
              client_id: "claude-web",
              authorization_endpoint: `${config.issuer}/api/oauth/authorize`,
              token_endpoint: `${config.issuer}/api/oauth/token`,
              scope: "read:analytics read:knowledge"
            }
          },
          {
            step: 4,
            title: "Test Connection",
            description: "Verify the integration works",
            action: `POST ${config.issuer}/api/claude/test`,
            headers: {
              "Authorization": "Bearer <your-access-token>"
            }
          }
        ]
      },

      scopes: {
        title: "Available Scopes and Tools",
        description: "OAuth scopes determine which tools Claude.ai can access",
        scopes: Object.entries(SUPPORTED_SCOPES).map(([scope, info]) => ({
          scope,
          description: info.description,
          tools: info.tools,
          example_use_cases: getScopeUseCases(scope)
        }))
      },

      troubleshooting: {
        title: "Common Issues and Solutions",
        issues: [
          {
            problem: "Authentication Failed",
            symptoms: ["401 Unauthorized", "Invalid token", "Authentication required"],
            solutions: [
              "Verify OAuth client is registered correctly",
              "Check that access token is not expired",
              "Ensure correct Authorization header format: 'Bearer <token>'",
              "Verify redirect URI matches registered URI exactly"
            ],
            test_endpoint: `${config.issuer}/api/claude/test`
          },
          {
            problem: "Tool Access Denied",
            symptoms: ["Access denied", "Insufficient permissions", "Tool not available"],
            solutions: [
              "Check OAuth scope includes required permissions",
              "Verify token has correct scope claims",
              "Request broader scope: 'read:analytics read:knowledge admin:usage'",
              "Use pre-configured 'claude-web' client with full scope"
            ],
            scope_check: Object.entries(SUPPORTED_SCOPES)
          },
          {
            problem: "Connection Timeout",
            symptoms: ["Request timeout", "Connection refused", "Server not responding"],
            solutions: [
              "Check server status at health endpoint",
              "Verify correct endpoint URL",
              "Ensure network connectivity",
              "Try basic connectivity test first"
            ],
            health_check: `${config.issuer}/api/health`
          },
          {
            problem: "Invalid MCP Response",
            symptoms: ["Protocol error", "Invalid JSON-RPC", "Unexpected format"],
            solutions: [
              "Ensure correct Content-Type: application/json",
              "Include Accept header: application/json, text/event-stream",
              "Follow JSON-RPC 2.0 specification",
              "Check request body format matches MCP protocol"
            ],
            protocol_info: "MCP 2024-10-07"
          }
        ]
      },

      examples: {
        title: "Integration Examples",
        oauth_flow: {
          step1: `GET ${config.issuer}/api/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/oauth/callback&scope=read:analytics+read:knowledge&state=integration-test`,
          step2: `POST ${config.issuer}/api/oauth/token`,
          step3: `POST ${config.issuer}/api/mcp (with Authorization: Bearer <token>)`
        },
        mcp_requests: {
          list_tools: {
            method: "POST",
            url: `${config.issuer}/api/mcp`,
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer <access-token>",
              "Accept": "application/json, text/event-stream"
            },
            body: {
              jsonrpc: "2.0",
              id: "1",
              method: "tools/list"
            }
          },
          call_tool: {
            method: "POST", 
            url: `${config.issuer}/api/mcp`,
            body: {
              jsonrpc: "2.0",
              id: "2", 
              method: "tools/call",
              params: {
                name: "echo",
                arguments: {
                  message: "Hello from Claude.ai!"
                }
              }
            }
          }
        }
      },

      contact: {
        title: "Support Contact",
        endpoints: {
          config: `${config.issuer}/api/claude/config`,
          test: `${config.issuer}/api/claude/test`,
          health: `${config.issuer}/api/health`,
          oauth_metadata: `${config.issuer}/.well-known/oauth-authorization-server`
        },
        server_info: {
          issuer: config.issuer,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }
      }
    };

    // Return specific section or overview
    const responseData = supportInfo[section as keyof typeof supportInfo] || supportInfo.overview;

    console.log(`📚 Claude.ai support documentation requested: ${section}`);

    return NextResponse.json({
      section,
      ...responseData,
      navigation: {
        available_sections: Object.keys(supportInfo),
        current_section: section
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600', // Cache for 10 minutes
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('❌ Error generating Claude.ai support info:', error);
    return NextResponse.json(
      { 
        error: 'support_error', 
        message: 'Failed to generate support documentation',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Helper function to generate use cases for scopes
function getScopeUseCases(scope: string): string[] {
  const useCases = {
    'read:analytics': [
      "Analyze website visitor behavior",
      "Generate traffic reports", 
      "Track conversion metrics",
      "Identify top-performing content",
      "Monitor company intelligence data"
    ],
    'read:knowledge': [
      "Explore organizational structure",
      "Find skill networks and capability paths", 
      "Query industrial/operational data",
      "Analyze employee relationships",
      "Generate org chart insights"
    ],
    'admin:usage': [
      "Monitor API usage statistics",
      "Check system health and status",
      "View database connection info",
      "Access administrative tools"
    ]
  };
  
  return useCases[scope as keyof typeof useCases] || [];
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