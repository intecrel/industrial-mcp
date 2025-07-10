import { NextRequest, NextResponse } from 'next/server'
import { AUTH_CONFIG } from '../../../lib/config'
import neo4j from 'neo4j-driver'

// MCP Protocol version
const MCP_VERSION = '1.0.0'

// Neo4j connection setup
let driver: neo4j.Driver | null = null

/**
 * Initialize Neo4j driver if not already initialized
 */
function getNeo4jDriver() {
  if (!driver) {
    const uri = process.env.NEO4J_URI || ''
    const user = process.env.NEO4J_USERNAME || ''
    const password = process.env.NEO4J_PASSWORD || ''

    if (!uri || !user || !password) {
      console.error('❌ Missing Neo4j credentials in environment variables')
      return null
    }

    try {
      driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
      console.log('✅ Neo4j driver initialized')
    } catch (error) {
      console.error('❌ Failed to create Neo4j driver:', error)
      return null
    }
  }
  return driver
}

/**
 * Verify API key from request headers
 */
function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '')
  
  if (!apiKey) {
    console.warn('🔑 Missing API key in request')
    return false
  }
  
  const isValid = apiKey === AUTH_CONFIG.API_KEY
  if (!isValid) {
    console.warn('🔑 Invalid API key provided')
  }
  
  return isValid
}

/**
 * Execute a Cypher query against Neo4j
 */
async function executeNeo4jQuery(query: string, params = {}): Promise<any> {
  const driver = getNeo4jDriver()
  if (!driver) {
    throw new Error('Neo4j driver not initialized')
  }
  
  const session = driver.session()
  try {
    const result = await session.run(query, params)
    return result.records.map(record => {
      const obj: Record<string, any> = {}
      record.keys.forEach(key => {
        const value = record.get(key)
        obj[key] = value && value.properties ? value.properties : value
      })
      return obj
    })
  } finally {
    await session.close()
  }
}

/**
 * Get available resources from the knowledge graph
 */
async function getAvailableResources(): Promise<any> {
  try {
    // Query for node labels (entity types)
    const labelQuery = `
      CALL db.labels() YIELD label
      RETURN label ORDER BY label
    `
    const labels = await executeNeo4jQuery(labelQuery)
    
    // Query for relationship types
    const relQuery = `
      CALL db.relationshipTypes() YIELD relationshipType
      RETURN relationshipType ORDER BY relationshipType
    `
    const relationships = await executeNeo4jQuery(relQuery)
    
    // Get counts for each entity type
    const entityCounts = await Promise.all(
      labels.map(async (label: any) => {
        const countQuery = `MATCH (n:${label.label}) RETURN count(n) as count`
        const result = await executeNeo4jQuery(countQuery)
        return {
          type: label.label,
          count: result[0]?.count?.low || 0
        }
      })
    )
    
    return {
      entityTypes: labels.map((l: any) => l.label),
      relationshipTypes: relationships.map((r: any) => r.relationshipType),
      entityCounts
    }
  } catch (error) {
    console.error('❌ Error getting resources:', error)
    return { error: 'Failed to retrieve resources' }
  }
}

/**
 * Process an MCP query against the knowledge graph
 */
async function processMcpQuery(query: string, params: any = {}): Promise<any> {
  try {
    // If the query is a special command, handle it differently
    if (query === '_GET_SCHEMA') {
      return await getAvailableResources()
    }
    
    // Otherwise, execute the Cypher query directly
    const results = await executeNeo4jQuery(query, params)
    return {
      results,
      count: results.length,
      query
    }
  } catch (error: any) {
    console.error('❌ Error processing MCP query:', error)
    return {
      error: error.message,
      query
    }
  }
}

/**
 * Format response according to MCP protocol
 */
function formatMcpResponse(data: any, success: boolean): any {
  return {
    mcp: {
      version: MCP_VERSION,
      timestamp: new Date().toISOString(),
      status: success ? 'success' : 'error'
    },
    data
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400'
    }
  })
}

/**
 * GET handler for MCP endpoint - returns info about the MCP service
 */
export async function GET(request: NextRequest) {
  console.log('📥 MCP GET request received')
  
  // Verify API key
  if (!verifyApiKey(request)) {
    return NextResponse.json(
      formatMcpResponse({ error: 'Unauthorized: Invalid or missing API key' }, false),
      { status: 401 }
    )
  }
  
  try {
    // Get information about available resources
    const resources = await getAvailableResources()
    
    // Return MCP info response
    return NextResponse.json(formatMcpResponse({
      name: 'Industrial MCP',
      description: 'Master Control Program for organizational knowledge graph',
      version: MCP_VERSION,
      resources
    }, true))
  } catch (error: any) {
    console.error('❌ Error in MCP GET handler:', error)
    return NextResponse.json(
      formatMcpResponse({ error: error.message || 'Internal server error' }, false),
      { status: 500 }
    )
  }
}

/**
 * POST handler for MCP endpoint - processes queries
 */
export async function POST(request: NextRequest) {
  console.log('📥 MCP POST request received')
  
  // Verify API key
  if (!verifyApiKey(request)) {
    return NextResponse.json(
      formatMcpResponse({ error: 'Unauthorized: Invalid or missing API key' }, false),
      { status: 401 }
    )
  }
  
  try {
    // Parse request body
    const body = await request.json()
    console.log('📄 MCP request body:', JSON.stringify(body).substring(0, 200) + '...')
    
    // Validate request format
    if (!body.query) {
      return NextResponse.json(
        formatMcpResponse({ error: 'Bad request: Missing query parameter' }, false),
        { status: 400 }
      )
    }
    
    // Process the query
    const result = await processMcpQuery(body.query, body.params || {})
    
    // Check for errors in the result
    const success = !result.error
    
    // Return formatted response
    return NextResponse.json(
      formatMcpResponse(result, success),
      { status: success ? 200 : 400 }
    )
  } catch (error: any) {
    console.error('❌ Error in MCP POST handler:', error)
    return NextResponse.json(
      formatMcpResponse({ error: error.message || 'Internal server error' }, false),
      { status: 500 }
    )
  }
}
