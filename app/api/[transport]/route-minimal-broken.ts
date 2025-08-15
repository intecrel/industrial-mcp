/**
 * MINIMAL MCP Server - Just Echo Tool for Claude.ai Testing
 * Simplified version of the working [transport] route
 */

import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { applyCORSHeaders } from '../../../lib/security/cors-config';
import { NextRequest } from 'next/server';

// Simple tool wrapper (no authentication needed)
const simpleTool = (toolName: string, toolFn: (params: any) => Promise<any>) => {
  return async (params: any) => {
    try {
      console.log(`📊 Simple tool ${toolName} called with:`, params);
      const result = await toolFn(params);
      console.log(`✅ Simple tool ${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Error in simple tool ${toolName}:`, error);
      throw error;
    }
  };
};

// Create minimal MCP handler with just echo tool
const handler = createMcpHandler(
  async (server) => {
    console.log('🚀 MINIMAL MCP Server starting - Echo only');
    
    // Register just the echo tool - using proper wrapper pattern
    server.tool(
      "echo",
      "Echo back the provided message",
      {
        message: z.string().describe("The message to echo back"),
      },
      // Use simple wrapper like authenticatedTool pattern
      simpleTool("echo", async ({ message }) => {
        console.log(`✅ MINIMAL Echo called: ${message}`);
        return {
          content: [{ type: "text", text: `MINIMAL Echo: ${message}` }],
        };
      })
    );
    
    console.log('✅ MINIMAL MCP Server ready with echo tool');
  }
);

// Simple wrapper - copy of working pattern but minimal
const createMinimalWrapper = (originalHandler: (request: Request, context?: any) => Promise<Response>) => {
  return async (request: Request, context?: any) => {
    console.log(`🔄 MINIMAL MCP request: ${request.method}`);
    
    try {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        const response = new Response(null, { 
          status: 204,
          headers: { 'Content-Length': '0' }
        });
        applyCORSHeaders(request, response, process.env.NODE_ENV as any);
        return response;
      }
      
      // Call the MCP handler
      const response = await originalHandler(request, context);
      
      // Apply CORS headers
      applyCORSHeaders(request, response, process.env.NODE_ENV as any);
      
      console.log(`✅ MINIMAL MCP response: ${response.status}`);
      return response;
    } catch (error) {
      console.error('❌ MINIMAL MCP error:', error);
      const errorResponse = Response.json({
        error: "MINIMAL MCP Server Error",
        message: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
      
      applyCORSHeaders(request, errorResponse, process.env.NODE_ENV as any);
      return errorResponse;
    }
  };
};

// Create the minimal wrapped handler
const minimalHandler = createMinimalWrapper(handler);

// Export all methods
export const GET = minimalHandler;
export const POST = minimalHandler;
export const HEAD = minimalHandler;
export const DELETE = minimalHandler;
export const PUT = minimalHandler;
export const OPTIONS = minimalHandler;