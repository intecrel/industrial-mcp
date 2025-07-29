import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

/**
 * Industrial MCP Server Handler
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
    
    // Register industrial system status tool
    server.tool(
      "get_system_status",
      "Get the current industrial system status and health metrics",
      {
        // No parameters needed for basic status check
      },
      async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "operational",
              uptime: "24h 15m 32s",
              lastCheck: new Date().toISOString(),
              systemHealth: {
                cpu: "45%",
                memory: "67%",
                disk: "23%",
                network: "operational"
              },
              alerts: [],
              activeProcesses: 42
            }, null, 2)
          }
        ],
      })
    );
    
    // Register operational data tool
    server.tool(
      "get_operational_data",
      "Get real-time operational data from industrial systems",
      {
        timeRange: z.string().optional().describe("Time range for data (e.g., '1h', '24h', '7d')"),
        system: z.string().optional().describe("Specific system to query")
      },
      async ({ timeRange = "1h", system = "all" }) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              timeRange,
              system,
              timestamp: new Date().toISOString(),
              metrics: {
                throughput: "1.2GB/s",
                activeConnections: 156,
                errorRate: "0.01%",
                responseTime: "45ms",
                queueDepth: 23
              },
              performance: {
                efficiency: "96.7%",
                availability: "99.9%",
                reliability: "98.5%"
              },
              trends: {
                last24h: {
                  peakThroughput: "2.1GB/s",
                  avgResponseTime: "52ms",
                  totalRequests: 1_245_678
                }
              }
            }, null, 2)
          }
        ],
      })
    );
    
    // Register equipment monitoring tool
    server.tool(
      "monitor_equipment",
      "Monitor specific industrial equipment status and performance",
      {
        equipmentId: z.string().describe("Equipment identifier to monitor"),
        includeHistory: z.boolean().optional().describe("Include historical data")
      },
      async ({ equipmentId, includeHistory = false }) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              equipmentId,
              status: "running",
              temperature: "72°C",
              vibration: "normal",
              pressure: "145 PSI",
              powerConsumption: "850W",
              efficiency: "94%",
              nextMaintenance: "2025-08-15",
              ...(includeHistory && {
                history: {
                  lastWeek: {
                    avgTemperature: "70°C",
                    maxVibration: "2.1mm/s",
                    downtimeMinutes: 0
                  }
                }
              })
            }, null, 2)
          }
        ],
      })
    );
  },
  // Capabilities configuration
  {
    capabilities: {
      tools: {
        echo: {
          description: "Echo a message",
        },
        get_system_status: {
          description: "Get industrial system status",
        },
        get_operational_data: {
          description: "Get operational metrics and data",
        },
        monitor_equipment: {
          description: "Monitor specific equipment",
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
