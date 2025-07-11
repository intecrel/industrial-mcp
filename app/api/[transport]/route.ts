import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

/**
 * MCP Server Handler
 * 
 * This creates a Model Context Protocol (MCP) server using Vercel's MCP adapter.
 * The dynamic [transport] route parameter allows this handler to respond to:
 * - /api/mcp (JSON-RPC over HTTP)
 * - /api/stdio (for CLI tools)
 * - /api/sse (Server-Sent Events for streaming)
 */
const handler = createMcpHandler(
  // Server configuration function - define tools here
  async (server) => {
    // Register the "echo" tool
    server.tool(
      "echo",
      "Echo back the provided message",
      {
        // Tool parameters schema using zod
        message: z.string().describe("The message to echo back"),
      },
      // Tool implementation
      async ({ message }) => ({
        content: [{ type: "text", text: `Tool echo: ${message}` }],
      })
    );
    
    // Add more tools here as needed
  },
  // Capabilities configuration
  {
    capabilities: {
      tools: {
        echo: {
          description: "Echo a message",
        },
      },
    },
  },
  // MCP adapter options
  {
    // IMPORTANT: basePath must match the route location
    // Since this file is at app/api/[transport]/route.ts,
    // basePath must be "/api" for /api/mcp to work correctly
    basePath: "/api",
    verboseLogs: true,
    maxDuration: 60,
  }
);

// Explicit named exports for better compatibility with Vercel
// This is preferred over the aliased exports syntax
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
