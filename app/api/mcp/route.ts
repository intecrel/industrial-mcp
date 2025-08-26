/**
 * Direct MCP endpoint route using Vercel MCP Adapter
 * This creates a proper MCP server that Claude.ai can discover and use
 */

import { createMcpHandler, withMcpAuth } from "@vercel/mcp-adapter";
import { z } from "zod";
import { NextRequest } from 'next/server';

// Simple token verification for testing (allows all requests)
const verifyToken = async (req: Request, bearerToken?: string): Promise<{
  token: string;
  scopes: string[];
  clientId: string;
  extra?: Record<string, any>;
} | undefined> => {
  console.log('🔐 MCP token verification - allowing all requests for testing');
  
  const authorization = bearerToken || req.headers.get('authorization') || '';
  if (!authorization) {
    console.log('🔓 No token provided, allowing unauthenticated access');
    return undefined; // Allow unauthenticated access
  }
  
  console.log(`✅ Token accepted: ${authorization.substring(0, 20)}...`);
  return {
    token: authorization.replace('Bearer ', ''),
    scopes: ['read:all'], 
    clientId: 'claude-ai',
    extra: {
      method: 'oauth',
      userId: 'test-user'
    }
  };
};

/**
 * Create MCP handler with simple test tools
 */
const handler = createMcpHandler(
  // Server configuration - register tools here
  async (server) => {
    console.log('🔧 Initializing MCP server with test tools');
    
    // Register simple echo tool
    server.tool(
      "echo",
      "Echo back the provided message",
      {
        message: z.string().describe("The message to echo back"),
      },
      async ({ message }) => {
        console.log(`🔧 Echo tool called with: ${message}`);
        return {
          content: [{
            type: "text",
            text: `Echo from Industrial MCP Server: ${message}`
          }],
        };
      }
    );

    // Register a simple test tool
    server.tool(
      "get_server_status",
      "Get the status of the Industrial MCP server",
      {},
      async () => {
        console.log('🔧 Server status tool called');
        return {
          content: [{
            type: "text", 
            text: JSON.stringify({
              status: "operational",
              server_name: "Industrial MCP Server",
              version: "2.0.0",
              tools_available: 2,
              timestamp: new Date().toISOString(),
              message: "MCP server is running successfully with Vercel MCP adapter!"
            }, null, 2)
          }],
        };
      }
    );

    console.log('✅ MCP server initialized with 2 test tools');
  },
  // Capabilities configuration
  {
    capabilities: {
      tools: {
        echo: {
          description: "Echo messages back to test connectivity",
        },
        get_server_status: {
          description: "Get server status and health information",
        },
      },
    },
  },
  // MCP adapter options  
  {
    basePath: "/api/mcp", // Explicit base path for this endpoint
    verboseLogs: true,
    maxDuration: 30,
  }
);

// Apply MCP authentication wrapper (allowing unauthenticated access for testing)
const authenticatedHandler = withMcpAuth(handler, verifyToken, {
  required: false, // Allow unauthenticated requests 
  requiredScopes: [], // No specific scopes required
});

// Export HTTP methods
export const GET = authenticatedHandler;
export const POST = authenticatedHandler;  
export const OPTIONS = authenticatedHandler;
export const HEAD = authenticatedHandler;