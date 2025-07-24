// Create: app/api/mcp/route.ts
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
  try {
    const { method, params } = await request.json()
    
    console.log('🔧 MCP Request:', { method, params })
    
    switch (method) {
      case 'tools/list':
        return NextResponse.json({
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
          return NextResponse.json({
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
          return NextResponse.json({
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
        break
        
      default:
        return NextResponse.json({ error: 'Method not supported' }, { status: 400 })
    }
    
  } catch (error) {
    console.error('🚨 MCP Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}