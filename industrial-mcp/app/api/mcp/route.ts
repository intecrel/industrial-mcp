import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    message: "Industrial MCP Server",
    status: "online",
    description: "This is an MCP (Model Context Protocol) server for Claude integration",
    endpoints: {
      "POST /api/mcp": "MCP protocol endpoint for tool calls",
      "tools": ["get_system_status", "get_operational_data"]
    },
    usage: "Use this URL in Claude's custom MCP connector",
    timestamp: new Date().toISOString()
  })
}

export async function POST(request: NextRequest) {
  console.log('🚨 MCP POST ROUTE HIT!') // ADD THIS LINE HERE
  try {
    const body = await request.json()
    const { method, params, id, jsonrpc } = body
    
    console.log('🔧 MCP Request:', { method, params, id, jsonrpc })
    
    // Helper function to create JSONRPC 2.0 responses
    const createResponse = (result: any, error: any = null) => {
      return new NextResponse(JSON.stringify({
        jsonrpc: "2.0",
        id: id || null,
        ...(error ? { error } : { result })
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
        }
      })
    }
    
    switch (method) {
      case 'initialize':
        return createResponse({
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: "Industrial MCP",
            version: "1.0.0"
          }
        })
        
      case 'tools/list':
        return createResponse({
          tools: [
            {
              name: 'get_system_status',
              description: 'Get current industrial system status',
              inputSchema: {
                type: 'object',
                properties: {},
                required: []
              }
            },
            {
              name: 'get_operational_data',
              description: 'Get operational data from industrial systems',
              inputSchema: {
                type: 'object',
                properties: {
                  dataType: {
                    type: 'string',
                    description: 'Type of data to retrieve',
                    enum: ['temperature', 'pressure', 'flow', 'all']
                  }
                },
                required: []
              }
            }
          ]
        })
        
      case 'tools/call':
        if (params.name === 'get_system_status') {
          return createResponse({
            content: [
              {
                type: 'text',
                text: `🏭 Industrial System Status:
- Status: ✅ OPERATIONAL
- Temperature: 22°C
- Pressure: 1.2 bar
- Flow Rate: 45 L/min
- Last Update: ${new Date().toLocaleString()}`
              }
            ]
          })
        }
        
        if (params.name === 'get_operational_data') {
          const { dataType = 'all' } = params.arguments || {}
          return createResponse({
            content: [
              {
                type: 'text',
                text: `📊 Operational Data (${dataType}):
- Temperature: 22.3°C (Normal)
- Pressure: 1.23 bar (Normal) 
- Flow: 45.7 L/min (Normal)
- Power: 87.4 kW (Normal)`
              }
            ]
          })
        }
        
        return createResponse(null, {
          code: -32601,
          message: `Unknown tool: ${params.name}`
        })
        
      default:
        return createResponse(null, {
          code: -32601,
          message: `Method not found: ${method}`
        })
    }
    
  } catch (error) {
    console.error('🚨 MCP Error:', error)
    return new NextResponse(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: "Internal error"
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
    }
  })
}