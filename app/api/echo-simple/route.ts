/**
 * Minimal MCP Echo Server - With Required Wrapper
 * Copy of working [transport] pattern but simplified
 */

import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

// Create the MCP handler exactly like working route
const handler = createMcpHandler(
  async (server) => {
    console.log('🚀 Echo-simple MCP server initializing');
    
    // Register one simple echo tool
    server.tool(
      "echo",
      "Echo back the provided message",
      {
        message: z.string().describe("The message to echo back"),
      },
      async ({ message }) => {
        console.log(`✅ Echo-simple called with: ${message}`);
        return {
          content: [{ type: "text", text: `Echo: ${message}` }],
        };
      }
    );
  }
);

// Minimal wrapper based on working pattern
const createSimpleWrapper = (originalHandler: (request: Request, context?: any) => Promise<Response>) => {
  return async (request: Request, context?: any) => {
    try {
      console.log(`📡 Echo-simple request: ${request.method} from ${request.headers.get('x-forwarded-for') || 'unknown'}`);
      
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { 
          status: 204,
          headers: { 
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Length': '0' 
          }
        });
      }
      
      // Call original handler
      const response = await originalHandler(request, context);
      
      // Log response details for debugging
      const responseText = await response.clone().text();
      console.log(`📄 Echo-simple response body: ${responseText}`);
      
      // Log headers in a TypeScript-compatible way
      const headersList: string[] = [];
      response.headers.forEach((value, key) => {
        headersList.push(`${key}: ${value}`);
      });
      console.log(`📊 Echo-simple response headers:`, headersList);
      
      // Add CORS headers to response
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      console.log(`✅ Echo-simple response: ${response.status}`);
      return response;
    } catch (error) {
      console.error('❌ Echo-simple error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
};

// Wrap and export the handler
const wrappedHandler = createSimpleWrapper(handler);

export const GET = wrappedHandler;
export const POST = wrappedHandler;
export const HEAD = wrappedHandler;
export const DELETE = wrappedHandler;
export const PUT = wrappedHandler;
export const OPTIONS = wrappedHandler;