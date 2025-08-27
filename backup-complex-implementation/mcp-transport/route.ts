/**
 * Direct Vercel MCP Adapter Endpoint - For Direct Access Testing
 * This endpoint can be accessed directly at /api/mcp-transport
 * to test if the issue is with middleware rewrites or our custom implementation
 */

import { createMcpHandler, withMcpAuth } from "@vercel/mcp-adapter";
import { z } from "zod";

// Simple token verification (allows all requests for testing)
const verifyToken = async (req: Request, bearerToken?: string) => {
  console.log('🔐 Direct Vercel MCP adapter - allowing all requests for testing');
  return undefined; // Allow unauthenticated access
};

/**
 * Direct Vercel MCP handler with working tools
 */
const handler = createMcpHandler(
  async (server) => {
    console.log('✅ DIRECT Vercel MCP adapter initializing with test tools');
    
    // Register echo tool
    server.tool(
      "echo",
      "Echo back the provided message",
      {
        message: z.string().describe("The message to echo back"),
      },
      async ({ message }) => {
        console.log('🎯 DIRECT MCP ADAPTER: Echo tool called!');
        return {
          content: [{ type: "text", text: `Direct MCP Echo: ${message}` }],
        };
      }
    );
    
    // Register server status tool
    server.tool(
      "get_server_status", 
      "Get server status from direct Vercel MCP adapter",
      {},
      async () => {
        console.log('🎯 DIRECT MCP ADAPTER: Server status tool called!');
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "DIRECT_VERCEL_MCP_ADAPTER_WORKING",
              message: "This is the direct Vercel MCP adapter accessible at /api/mcp-transport",
              tools_available: 2,
              timestamp: new Date().toISOString()
            }, null, 2)
          }],
        };
      }
    );

    console.log('✅ DIRECT MCP adapter ready with 2 tools');
  },
  {
    capabilities: {
      tools: {
        echo: { description: "Echo messages" },
        get_server_status: { description: "Get server status" },
      },
    },
  },
  {
    verboseLogs: true,
    maxDuration: 30,
  }
);

// Apply auth wrapper
const authenticatedHandler = withMcpAuth(handler, verifyToken, {
  required: false,
  requiredScopes: [],
});

export const GET = authenticatedHandler;
export const POST = authenticatedHandler;
export const OPTIONS = authenticatedHandler;
export const HEAD = authenticatedHandler;