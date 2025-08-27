/**
 * MINIMAL MCP Server - Clean Start
 * Simple JSON-RPC 2.0 implementation with just echo tool
 * No adapters, no complexity - build up step by step
 */

import { NextRequest, NextResponse } from 'next/server'

// Simple echo tool handler
async function handleEchoTool(params: any) {
  console.log('🎯 ECHO TOOL CALLED:', params)
  return {
    content: [
      {
        type: "text" as const,
        text: `Echo: ${params.message || 'No message provided'}`
      }
    ]
  }
}

export async function POST(request: NextRequest) {
  console.log('🚀 MINIMAL MCP SERVER: Request received')
  
  try {
    const body = await request.json()
    console.log('📥 MCP Request:', JSON.stringify(body, null, 2))

    const { method, id } = body

    // Handle initialize
    if (method === 'initialize') {
      console.log('✅ MCP INITIALIZE called')
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {}
          },
          serverInfo: {
            name: "Industrial MCP - Minimal",
            version: "1.0.0"
          }
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      })
    }

    // Handle tools/list
    if (method === 'tools/list') {
      console.log('📋 TOOLS/LIST called - returning echo + explore_database tools')
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "echo",
              description: "Echo back the provided message",
              inputSchema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "The message to echo back"
                  }
                },
                required: ["message"]
              }
            },
            {
              name: "explore_database",
              description: "Explore database structure - list tables, inspect schemas, and discover data",
              inputSchema: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["list_tables", "describe_table", "sample_data"],
                    description: "What to explore: list_tables, describe_table, or sample_data"
                  },
                  table_name: {
                    type: "string",
                    description: "Table name (required for describe_table and sample_data)"
                  },
                  limit: {
                    type: "number",
                    description: "Number of sample rows to return (default: 10)"
                  }
                },
                required: ["action"]
              }
            }
          ]
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Handle tools/call
    if (method === 'tools/call') {
      console.log('🛠️ TOOLS/CALL:', body.params)
      const { name, arguments: args } = body.params

      if (name === 'echo') {
        const result = await handleEchoTool(args)
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      if (name === 'explore_database') {
        console.log('🗃️ EXPLORE_DATABASE called:', args)
        try {
          // Import the database explorer from the backup
          const { exploreDatabaseStructure } = await import('../../../backup-complex-implementation/mcp/tools/database-explorer');
          const result = await exploreDatabaseStructure({ 
            action: args.action, 
            table_name: args.table_name, 
            limit: args.limit || 10
          });
          
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (error) {
          console.error('❌ Database explorer error:', error)
          return NextResponse.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Database explorer error: ${error instanceof Error ? error.message : String(error)}`
                }
              ]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
      }

      // Tool not found
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Tool '${name}' not found`
        }
      }, {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Method not supported
    console.log('❌ Unsupported method:', method)
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method '${method}' not found`
      }
    }, {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('💥 MCP Error:', error)
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: 'Internal server error',
        data: error instanceof Error ? error.message : String(error)
      }
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

export async function GET(request: NextRequest) {
  console.log('📡 MCP GET request - returning server info')
  return NextResponse.json({
    name: "Industrial MCP - Minimal",
    version: "1.0.0",
    description: "Minimal MCP server with echo tool",
    tools: ["echo"],
    status: "active"
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}