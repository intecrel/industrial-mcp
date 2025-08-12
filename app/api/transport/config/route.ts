/**
 * Multi-Transport Configuration Endpoint
 * Provides configuration for all supported MCP transport methods
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../../lib/oauth/config';
import { SUPPORTED_SCOPES } from '../../../../lib/oauth/scopes';

export async function GET(request: NextRequest) {
  try {
    const config = getOAuthConfig();
    const { searchParams } = new URL(request.url);
    const transport = searchParams.get('transport') || 'all';
    const client = searchParams.get('client') || 'generic';

    // Multi-transport configuration
    const transportConfig = {
      server: {
        name: "Industrial MCP Server",
        description: "Multi-database MCP server with dual authentication support",
        version: "1.0.0",
        mcp_version: "2024-10-07",
        oauth_version: "2.1"
      },

      // Available transport methods
      transports: {
        // HTTP transport (most common)
        http: {
          name: "HTTP Transport",
          description: "Direct HTTP JSON-RPC communication",
          endpoint: `${config.issuer}/api/mcp`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
          },
          authentication: {
            oauth: {
              type: "Bearer Token",
              header: "Authorization: Bearer <token>",
              flow: "OAuth 2.1 with PKCE"
            },
            api_key: {
              type: "API Key + MAC Address",
              headers: {
                "x-api-key": "<your-api-key>",
                "x-mac-address": "<your-mac-address>"
              }
            }
          },
          clients: ["Claude.ai Web", "Custom HTTP Clients", "Direct API Access"],
          pros: ["Simple to implement", "Wide compatibility", "Real-time responses"],
          cons: ["Requires network connectivity", "HTTP-specific"]
        },

        // Stdio transport (for bridge/subprocess)
        stdio: {
          name: "Stdio Transport",
          description: "Standard input/output communication via bridge script",
          bridge_script: "./industrial-mcp-bridge-prod.js",
          command: "node",
          args: ["./industrial-mcp-bridge-prod.js"],
          env_vars: {
            MCP_SERVER_URL: `${config.issuer}/api/mcp`,
            MCP_OAUTH_TOKEN: "<oauth-token>", // OAuth option
            MCP_API_KEY: "<api-key>", // API key option
            MCP_MAC_ADDRESS: "<mac-address>", // MAC address option
            DEBUG: "false"
          },
          clients: ["Claude Desktop", "MCP CLI Tools", "Local Applications"],
          pros: ["Native MCP protocol", "Process isolation", "Local execution"],
          cons: ["Requires bridge script", "Process management"]
        },

        // Server-Sent Events transport
        sse: {
          name: "Server-Sent Events",
          description: "Streaming transport using SSE",
          endpoint: `${config.issuer}/api/sse`,
          method: "GET",
          stream: true,
          headers: {
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache"
          },
          authentication: {
            oauth: "?token=<bearer-token>",
            api_key: "?api_key=<key>&mac_address=<mac>"
          },
          clients: ["Web Applications", "Streaming Clients"],
          pros: ["Real-time streaming", "HTTP-based", "Automatic reconnection"],
          cons: ["One-way communication", "Browser limitations"]
        },

        // WebSocket transport (future enhancement)
        websocket: {
          name: "WebSocket Transport",
          description: "Bidirectional real-time communication",
          endpoint: `${config.issuer.replace('http', 'ws')}/api/ws`,
          protocol: "mcp-2024-10-07",
          authentication: {
            oauth: "Authorization header on handshake",
            api_key: "Custom headers on handshake"
          },
          clients: ["Real-time Applications", "Interactive Clients"],
          pros: ["Bidirectional", "Real-time", "Low latency"],
          cons: ["More complex", "Connection management"],
          status: "planned"
        }
      },

      // Client-specific configurations
      client_configs: {
        claude_desktop: {
          transport: "stdio",
          configuration: {
            mcpServers: {
              "industrial-mcp": {
                command: "node",
                args: ["./industrial-mcp-bridge-prod.js"],
                env: {
                  MCP_SERVER_URL: `${config.issuer}/api/mcp`,
                  MCP_OAUTH_TOKEN: "YOUR_TOKEN_HERE"
                }
              }
            }
          }
        },
        claude_web: {
          transport: "http",
          configuration: {
            endpoint: `${config.issuer}/api/mcp`,
            auth_type: "oauth2",
            client_id: "claude-web",
            authorization_url: `${config.issuer}/api/oauth/authorize`,
            token_url: `${config.issuer}/api/oauth/token`
          }
        },
        generic_http: {
          transport: "http",
          configuration: {
            endpoint: `${config.issuer}/api/mcp`,
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer <token>"
            }
          }
        }
      },

      // Setup instructions by transport
      setup_guides: {
        http_direct: {
          title: "Direct HTTP Integration",
          steps: [
            "Choose authentication method (OAuth or API Key)",
            "Configure HTTP client with appropriate headers",
            "Send JSON-RPC requests to the MCP endpoint",
            "Handle streaming responses for real-time data"
          ]
        },
        stdio_bridge: {
          title: "Stdio Bridge Integration",
          steps: [
            "Download the industrial-mcp-bridge-prod.js script",
            "Set environment variables for authentication",
            "Configure MCP client to use the bridge script",
            "Test connection and verify tool availability"
          ]
        }
      },

      // System information
      system: {
        server_url: config.issuer,
        health_endpoint: `${config.issuer}/api/health`,
        oauth_metadata: `${config.issuer}/.well-known/oauth-authorization-server`,
        available_scopes: Object.keys(SUPPORTED_SCOPES),
        total_tools: 18,
        databases: ["Neo4j Knowledge Graph", "MySQL Analytics (Matomo)"],
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    };

    // Filter by requested transport
    if (transport !== 'all' && transportConfig.transports[transport as keyof typeof transportConfig.transports]) {
      const singleTransport: any = {
        ...transportConfig,
        transport: transportConfig.transports[transport as keyof typeof transportConfig.transports]
      };
      delete singleTransport.transports;
      
      console.log(`🚀 Transport configuration requested: ${transport}`);
      return NextResponse.json(singleTransport, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Filter by client type
    if (client !== 'generic' && transportConfig.client_configs[client as keyof typeof transportConfig.client_configs]) {
      const clientConfig = {
        ...transportConfig,
        recommended_config: transportConfig.client_configs[client as keyof typeof transportConfig.client_configs]
      };
      
      console.log(`👤 Client configuration requested: ${client}`);
      return NextResponse.json(clientConfig, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.log('📋 Multi-transport configuration requested');

    return NextResponse.json(transportConfig, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('❌ Error generating transport config:', error);
    return NextResponse.json(
      { 
        error: 'transport_config_error', 
        message: 'Failed to generate transport configuration',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
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