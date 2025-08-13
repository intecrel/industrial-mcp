/**
 * Claude.ai MCP Connector Configuration Endpoint
 * Provides easy setup configuration for Claude.ai custom MCP integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../../lib/oauth/config';
import { SUPPORTED_SCOPES } from '../../../../lib/oauth/scopes';

export async function GET(request: NextRequest) {
  try {
    const config = getOAuthConfig();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    // Generate client configuration for Claude.ai
    const claudeConfig = {
      name: "Industrial MCP Server",
      description: "Advanced MCP server with dual-database access (Neo4j + MySQL)",
      version: "1.0.0",
      
      // MCP Server Configuration
      mcp_server: {
        type: "remote",
        transport: "http",
        endpoint: `${config.issuer}/api/mcp`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream"
        }
      },
      
      // OAuth 2.1 Authentication Configuration
      oauth: {
        enabled: true,
        client_id: "claude-web",
        authorization_endpoint: `${config.issuer}/api/oauth/authorize`,
        token_endpoint: `${config.issuer}/api/oauth/token`,
        scope: "read:analytics read:knowledge",
        redirect_uri: "https://claude.ai/oauth/callback", // Hypothetical Claude.ai callback
        response_type: "code",
        grant_type: "authorization_code",
        pkce_enabled: true
      },
      
      // Available Tools and Capabilities
      capabilities: {
        total_tools: Object.keys(SUPPORTED_SCOPES).length > 0 ? 18 : 0, // Approximate tool count
        scopes: Object.entries(SUPPORTED_SCOPES).map(([scope, info]) => ({
          scope,
          description: info.description,
          tools: info.tools,
          tool_count: info.tools.length
        })),
        databases: [
          {
            type: "Neo4j Knowledge Graph",
            purpose: "Industrial/Operational Data",
            entities: ["Machine", "Process", "Service", "Company", "Location", "Employee"],
            capabilities: ["Organizational Structure", "Skill Networks", "Capability Paths"]
          },
          {
            type: "MySQL Analytics",
            purpose: "Web Analytics (Matomo)",
            tables: "108+ tables",
            capabilities: ["Visitor Analytics", "Conversion Tracking", "Company Intelligence"]
          }
        ]
      },
      
      // Setup Instructions
      setup: {
        step1: {
          title: "Register OAuth Client",
          description: "Register your Claude.ai instance as an OAuth client",
          endpoint: `${config.issuer}/api/oauth/register`,
          method: "POST",
          example_payload: {
            client_name: "Claude.ai Custom Connector",
            redirect_uris: ["https://claude.ai/oauth/callback"],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            scope: "read:analytics read:knowledge"
          }
        },
        step2: {
          title: "Configure MCP Connection",
          description: "Add this MCP server to your Claude.ai custom connectors",
          configuration: {
            server_url: `${config.issuer}/api/mcp`,
            auth_type: "oauth2",
            client_id: "claude-web", // Pre-configured client
            authorization_url: `${config.issuer}/api/oauth/authorize`,
            token_url: `${config.issuer}/api/oauth/token`,
            scope: "read:analytics read:knowledge"
          }
        },
        step3: {
          title: "Test Connection",
          description: "Verify the connection works",
          test_endpoint: `${config.issuer}/api/claude/test`,
          expected_response: "Connection successful with available tools list"
        }
      },
      
      // Quick Start URLs
      quick_start: {
        authorize_url: `${config.issuer}/api/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/oauth/callback&scope=read:analytics+read:knowledge&state=claude-setup`,
        docs_url: `${config.issuer}/docs/claude-integration`,
        support_url: `${config.issuer}/api/claude/support`
      },
      
      // System Information
      system: {
        issuer: config.issuer,
        oauth_metadata: `${config.issuer}/.well-known/oauth-authorization-server`,
        health_check: `${config.issuer}/api/health`,
        status: "operational",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    };

    // Return configuration in requested format
    if (format === 'yaml') {
      // Simple YAML conversion for basic configuration
      const yamlConfig = `
# Industrial MCP Server Configuration for Claude.ai
name: "${claudeConfig.name}"
description: "${claudeConfig.description}"

mcp_server:
  type: remote
  transport: http
  endpoint: "${claudeConfig.mcp_server.endpoint}"
  
oauth:
  client_id: "${claudeConfig.oauth.client_id}"
  authorization_endpoint: "${claudeConfig.oauth.authorization_endpoint}"
  token_endpoint: "${claudeConfig.oauth.token_endpoint}"
  scope: "${claudeConfig.oauth.scope}"

quick_start:
  authorize_url: "${claudeConfig.quick_start.authorize_url}"
      `.trim();

      return new NextResponse(yamlConfig, {
        headers: {
          'Content-Type': 'text/yaml',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        }
      });
    }

    console.log('📋 Claude.ai MCP configuration requested');

    return NextResponse.json(claudeConfig, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (error) {
    console.error('❌ Error generating Claude.ai config:', error);
    return NextResponse.json(
      { 
        error: 'configuration_error', 
        message: 'Failed to generate Claude.ai configuration',
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