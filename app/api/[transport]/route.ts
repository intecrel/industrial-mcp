import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

// Simple in-memory cache for performance optimization
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();

// Cache utility functions
const getCacheKey = (toolName: string, params: any) => 
  `${toolName}:${JSON.stringify(params)}`;

const isCacheValid = (entry: CacheEntry) => 
  Date.now() - entry.timestamp < entry.ttl;

const getFromCache = (key: string): any | null => {
  const entry = cache.get(key);
  if (entry && isCacheValid(entry)) {
    console.log(`🚀 Cache hit for ${key}`);
    return entry.data;
  }
  if (entry) {
    cache.delete(key); // Remove expired entry
  }
  return null;
};

const setCache = (key: string, data: any, ttl: number = 30000) => {
  cache.set(key, { data, timestamp: Date.now(), ttl });
  console.log(`💾 Cached ${key} for ${ttl}ms`);
};

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
      async () => {
        const cacheKey = getCacheKey('get_system_status', {});
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          const statusData = {
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
          }
          
          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(statusData, null, 2)
              }
            ],
          };

          // Cache for 10 seconds (system status changes frequently)
          setCache(cacheKey, response, 10000);
          
          console.log('📊 System status requested successfully')
          return response;
        } catch (error) {
          console.error('❌ Error getting system status:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve system status",
                  message: "Unable to connect to industrial systems",
                  timestamp: new Date().toISOString(),
                  code: "SYSTEM_STATUS_ERROR"
                }, null, 2)
              }
            ],
          }
        }
      }
    );
    
    // Register operational data tool
    server.tool(
      "get_operational_data",
      "Get real-time operational data from industrial systems",
      {
        timeRange: z.string().optional().describe("Time range for data (e.g., '1h', '24h', '7d')"),
        system: z.string().optional().describe("Specific system to query")
      },
      async ({ timeRange = "1h", system = "all" }) => {
        const cacheKey = getCacheKey('get_operational_data', { timeRange, system });
        
        try {
          // Check cache first
          const cachedData = getFromCache(cacheKey);
          if (cachedData) {
            return cachedData;
          }

          // Validate time range
          const validTimeRanges = ['1h', '6h', '24h', '7d', '30d']
          if (timeRange && !validTimeRanges.includes(timeRange)) {
            throw new Error(`Invalid time range. Valid options: ${validTimeRanges.join(', ')}`)
          }

          const operationalData = {
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
          }

          const response = {
            content: [
              {
                type: "text",
                text: JSON.stringify(operationalData, null, 2)
              }
            ],
          };

          // Cache based on time range - longer ranges can be cached longer
          const cacheDuration = timeRange === '1h' ? 30000 : // 30 seconds
                               timeRange === '6h' ? 120000 : // 2 minutes  
                               timeRange === '24h' ? 300000 : // 5 minutes
                               600000; // 10 minutes for 7d/30d
          
          setCache(cacheKey, response, cacheDuration);

          console.log(`📈 Operational data requested - Range: ${timeRange}, System: ${system}`)
          return response;
        } catch (error) {
          console.error('❌ Error getting operational data:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to retrieve operational data",
                  message: error instanceof Error ? error.message : "Unable to access operational systems",
                  timestamp: new Date().toISOString(),
                  code: "OPERATIONAL_DATA_ERROR",
                  validTimeRanges: ['1h', '6h', '24h', '7d', '30d']
                }, null, 2)
              }
            ],
          }
        }
      }
    );
    
    // Register equipment monitoring tool
    server.tool(
      "monitor_equipment",
      "Monitor specific industrial equipment status and performance",
      {
        equipmentId: z.string().describe("Equipment identifier to monitor"),
        includeHistory: z.boolean().optional().describe("Include historical data")
      },
      async ({ equipmentId, includeHistory = false }) => {
        try {
          // Validate equipment ID format
          if (!equipmentId || equipmentId.trim().length === 0) {
            throw new Error("Equipment ID is required and cannot be empty")
          }
          
          if (equipmentId.length > 50) {
            throw new Error("Equipment ID too long (maximum 50 characters)")
          }

          // Simulate equipment lookup
          const equipmentExists = /^[A-Z0-9-]+$/i.test(equipmentId)
          if (!equipmentExists) {
            throw new Error(`Invalid equipment ID format: ${equipmentId}. Use alphanumeric characters and hyphens only.`)
          }

          const equipmentData = {
            equipmentId,
            status: "running",
            temperature: "72°C",
            vibration: "normal",
            pressure: "145 PSI",
            powerConsumption: "850W",
            efficiency: "94%",
            nextMaintenance: "2025-08-15",
            lastUpdated: new Date().toISOString(),
            ...(includeHistory && {
              history: {
                lastWeek: {
                  avgTemperature: "70°C",
                  maxVibration: "2.1mm/s",
                  downtimeMinutes: 0
                }
              }
            })
          }

          console.log(`🔧 Equipment monitoring requested - ID: ${equipmentId}, History: ${includeHistory}`)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(equipmentData, null, 2)
              }
            ],
          }
        } catch (error) {
          console.error('❌ Error monitoring equipment:', error)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "Failed to monitor equipment",
                  message: error instanceof Error ? error.message : "Unable to access equipment monitoring systems",
                  timestamp: new Date().toISOString(),
                  code: "EQUIPMENT_MONITOR_ERROR",
                  equipmentId: equipmentId || "unknown"
                }, null, 2)
              }
            ],
          }
        }
      }
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
