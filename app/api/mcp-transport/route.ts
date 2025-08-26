/**
 * Pure Vercel MCP Adapter Endpoint - No Forwarding
 * This is a direct copy of the working MCP adapter from /api/[transport] 
 * but without the forwarding logic that redirects to /api/mcp
 */

import { createMcpHandler, withMcpAuth } from "@vercel/mcp-adapter";
import { z } from "zod";

// Simple token verification (allows all requests for testing)
const verifyToken = async (req: Request, bearerToken?: string) => {
  console.log('🔐 Pure MCP adapter - allowing all requests for testing');
  return undefined; // Allow unauthenticated access
};

/**
 * Pure Vercel MCP handler with working tools
 */
const handler = createMcpHandler(
  async (server) => {
    console.log('✅ PURE Vercel MCP adapter initializing with test tools');
    
    // Register echo tool
    server.tool(
      "echo",
      "Echo back the provided message",
      {
        message: z.string().describe("The message to echo back"),
      },
      async ({ message }) => {
        console.log('🎯 PURE MCP ADAPTER: Echo tool called!');
        return {
          content: [{ type: "text", text: `Pure MCP Echo: ${message}` }],
        };
      }
    );
    
    // Register server status tool
    server.tool(
      "get_server_status", 
      "Get server status from pure Vercel MCP adapter",
      {},
      async () => {
        console.log('🎯 PURE MCP ADAPTER: Server status tool called!');
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "PURE_VERCEL_MCP_ADAPTER_WORKING",
              message: "This is the pure Vercel MCP adapter without forwarding",
              tools_available: 2,
              timestamp: new Date().toISOString()
            }, null, 2)
          }],
        };
      }
    );

    console.log('✅ PURE MCP adapter ready with 2 tools');
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
    basePath: "/api/mcp-transport",
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