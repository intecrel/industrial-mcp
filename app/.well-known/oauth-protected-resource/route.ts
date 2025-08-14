/**
 * OAuth 2.0 Protected Resource Metadata Endpoint
 * RFC 8705 - OAuth 2.0 Resource Server Metadata
 * Tells clients where the protected MCP resources are located
 */

import { NextResponse } from 'next/server';
import { getOAuthConfig } from '../../../lib/oauth/config';

export async function GET() {
  try {
    const config = getOAuthConfig();
    
    const metadata = {
      // Resource server identifier
      resource: config.issuer,
      
      // Authorization server that protects this resource
      authorization_servers: [config.issuer],
      
      // MCP server URL (Claude.ai connects to base URL)
      server_url: config.issuer,
      mcp_server: config.issuer,
      
      // Transport endpoints
      transport_endpoints: [
        {
          type: "http", 
          url: `${config.issuer}/api/mcp`,
          methods: ["POST"]
        },
        {
          type: "sse",
          url: `${config.issuer}/api/sse`, 
          methods: ["GET", "POST"]
        }
      ],
      
      // Supported scopes for this resource server
      scopes_supported: config.supportedScopes,
      
      // Bearer token usage
      bearer_methods_supported: ['header'],
      bearer_locations_supported: ['authorization'],
      
      // Resource server capabilities
      capabilities: {
        tools: 18,
        resources: true,
        prompts: true,
        notifications: false,
        progress: false,
        logging: true
      },
      
      // Service information
      service_documentation: `${config.issuer}/docs`,
      service_name: 'Industrial MCP Server',
      service_version: '2.0.0',
      
      // Database information
      databases: [
        {
          type: 'Neo4j',
          name: 'Knowledge Graph',
          description: 'Industrial/operational data and organizational structures'
        },
        {
          type: 'MySQL',
          name: 'Analytics Database', 
          description: 'Matomo web analytics and visitor intelligence'
        }
      ]
    };
    
    console.log('📋 Serving MCP Protected Resource Metadata');
    
    return NextResponse.json(metadata, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('❌ Error serving protected resource metadata:', error);
    
    return NextResponse.json({
      error: 'server_error',
      error_description: 'Failed to retrieve protected resource metadata'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}