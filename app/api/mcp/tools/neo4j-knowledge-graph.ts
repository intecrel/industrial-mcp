/**
 * Neo4j Knowledge Graph Tools for Industrial MCP Server
 * Implements IMCP-43: Neo4j Knowledge Graph Tools
 * 
 * Provides secure access to organizational knowledge graph data with:
 * - Parameterized Cypher queries with injection prevention
 * - Organizational structure queries
 * - Capability and skill network analysis
 * - Comprehensive error handling and logging
 */

import { getGlobalDatabaseManager } from '../../../../lib/database'

// Cypher injection prevention - allowlist of safe Cypher patterns
const SAFE_CYPHER_PATTERNS = [
  // Node patterns
  /^\([a-zA-Z_][a-zA-Z0-9_]*(:?[a-zA-Z_][a-zA-Z0-9_]*)*\)$/,
  // Relationship patterns
  /^-\[:?[a-zA-Z_][a-zA-Z0-9_]*\]->?$/,
  // Property patterns
  /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/,
  // Function patterns (MATCH, RETURN, WHERE, etc.)
  /^(MATCH|RETURN|WHERE|ORDER BY|LIMIT|WITH|CREATE|MERGE|SET|DELETE|REMOVE)\s+/i
]

// Dangerous Cypher keywords to block
const DANGEROUS_KEYWORDS = [
  'DROP', 'DELETE', 'REMOVE', 'DETACH DELETE', 'CREATE CONSTRAINT', 
  'DROP CONSTRAINT', 'CREATE INDEX', 'DROP INDEX', 'CALL dbms',
  'CALL db.', 'LOAD CSV', 'USING PERIODIC COMMIT', 'FOREACH'
]

/**
 * Validates and sanitizes Cypher queries to prevent injection attacks
 */
function validateCypherQuery(query: string): { isValid: boolean; sanitized: string; error?: string } {
  try {
    // Remove comments and normalize whitespace
    const normalized = query
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/\/\/.*$/gm, '') // Remove // comments
      .replace(/\s+/g, ' ')
      .trim()

    // Check for dangerous keywords
    const upperQuery = normalized.toUpperCase()
    for (const keyword of DANGEROUS_KEYWORDS) {
      if (upperQuery.includes(keyword.toUpperCase())) {
        return {
          isValid: false,
          sanitized: '',
          error: `Dangerous operation detected: ${keyword}`
        }
      }
    }

    // Ensure query starts with MATCH or RETURN (read-only operations)
    if (!upperQuery.startsWith('MATCH') && !upperQuery.startsWith('RETURN') && !upperQuery.startsWith('WITH')) {
      return {
        isValid: false,
        sanitized: '',
        error: 'Only read-only queries (MATCH, RETURN, WITH) are allowed'
      }
    }

    // Basic structure validation - ensure it looks like valid Cypher
    if (normalized.length < 5 || !normalized.includes('RETURN')) {
      return {
        isValid: false,
        sanitized: '',
        error: 'Query must be valid Cypher with RETURN clause'
      }
    }

    return {
      isValid: true,
      sanitized: normalized
    }
  } catch (error) {
    return {
      isValid: false,
      sanitized: '',
      error: `Query validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Execute parameterized Cypher queries against the knowledge graph
 */
export async function queryKnowledgeGraph({ 
  query, 
  parameters = {}, 
  limit = 100 
}: { 
  query: string
  parameters?: Record<string, any>
  limit?: number 
}) {
  try {
    const dbManager = await getGlobalDatabaseManager()
    const neo4j = dbManager.getConnection('neo4j') // Get Neo4j connection by name

    if (!neo4j.isConnected) {
      await neo4j.connect()
    }

    // Validate and sanitize the query
    const validation = validateCypherQuery(query)
    if (!validation.isValid) {
      throw new Error(`Query validation failed: ${validation.error}`)
    }

    // Add LIMIT to prevent large result sets
    let finalQuery = validation.sanitized
    if (limit && limit > 0 && !finalQuery.toUpperCase().includes('LIMIT')) {
      finalQuery += ` LIMIT ${Math.min(limit, 1000)}` // Cap at 1000 for safety
    }

    console.log(`🔍 Executing Neo4j query: ${finalQuery.substring(0, 100)}...`)
    console.log(`📊 Parameters:`, parameters)

    // Convert parameters to array format for the Neo4j driver
    const paramArray = Object.values(parameters)
    const result = await neo4j.query(finalQuery, paramArray)

    if (!result.success) {
      throw new Error(result.error || 'Query execution failed')
    }

    return {
      success: true,
      query: finalQuery,
      records: result.data,
      count: result.data?.length || 0,
      metadata: result.metadata,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('❌ Neo4j query error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      query: query,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Get organizational structure including departments and reporting hierarchies
 */
export async function getOrganizationalStructure({ 
  department = null, 
  depth = 3,
  includeEmployees = false 
}: { 
  department?: string | null
  depth?: number
  includeEmployees?: boolean
} = {}) {
  try {
    // Build the query based on parameters
    const query = `
      MATCH (dept:Department)
      ${department ? 'WHERE dept.name = $param0 OR dept.id = $param0' : ''}
      OPTIONAL MATCH path = (dept)-[:PARENT_OF|REPORTS_TO*1..${Math.min(depth, 5)}]-(related:Department)
      ${includeEmployees ? 'OPTIONAL MATCH (emp:Employee)-[:WORKS_IN]->(dept)' : ''}
      RETURN dept, 
             collect(DISTINCT related) as related_departments,
             ${includeEmployees ? 'collect(DISTINCT emp) as employees,' : ''}
             length(path) as hierarchy_depth
      ORDER BY dept.name
      LIMIT 50
    `

    const parameters = department ? { param0: department } : {}
    
    const result = await queryKnowledgeGraph({
      query,
      parameters,
      limit: 50
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    return {
      success: true,
      organizational_structure: result.records,
      department_filter: department,
      depth: depth,
      include_employees: includeEmployees,
      count: result.count,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('❌ Organizational structure query error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve organizational structure',
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Find capability paths and skill networks within the organization
 */
export async function findCapabilityPaths({ 
  skill, 
  sourceEmployee = null, 
  targetRole = null,
  maxHops = 4 
}: { 
  skill: string
  sourceEmployee?: string | null
  targetRole?: string | null
  maxHops?: number
}) {
  try {
    // Build query to find skill/capability paths
    const query = `
      MATCH (s:Skill {name: $param0})
      MATCH (emp:Employee)
      ${sourceEmployee ? 'WHERE emp.name = $param1 OR emp.id = $param1' : ''}
      ${targetRole ? 'MATCH (role:Role) WHERE role.name = $param2 OR role.title = $param2' : ''}
      
      // Find employees with the skill
      OPTIONAL MATCH (emp)-[:HAS_SKILL]->(s)
      
      // Find skill development paths
      OPTIONAL MATCH skillPath = (s)-[:REQUIRES|LEADS_TO*1..${Math.min(maxHops, 6)}]-(relatedSkill:Skill)
      
      // Find capability networks
      OPTIONAL MATCH capabilityPath = (emp)-[:HAS_CAPABILITY]->(cap:Capability)-[:REQUIRES_SKILL]->(s)
      
      ${targetRole ? `
      // Find paths to target role
      OPTIONAL MATCH rolePath = (emp)-[:CAN_PERFORM*1..${Math.min(maxHops, 4)}]->(role)
      ` : ''}
      
      RETURN emp,
             s as target_skill,
             collect(DISTINCT relatedSkill) as related_skills,
             collect(DISTINCT cap) as capabilities,
             ${targetRole ? 'collect(DISTINCT role) as target_roles,' : ''}
             length(skillPath) as skill_path_length,
             ${targetRole ? 'length(rolePath) as role_path_length,' : ''}
             skillPath,
             capabilityPath
             ${targetRole ? ', rolePath' : ''}
      ORDER BY skill_path_length, emp.name
      LIMIT 25
    `

    const parameters: Record<string, any> = { param0: skill }
    if (sourceEmployee) parameters.param1 = sourceEmployee
    if (targetRole) parameters.param2 = targetRole

    const result = await queryKnowledgeGraph({
      query,
      parameters,
      limit: 25
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    return {
      success: true,
      capability_analysis: {
        target_skill: skill,
        source_employee: sourceEmployee,
        target_role: targetRole,
        max_hops: maxHops,
        paths: result.records,
        summary: {
          total_paths: result.count,
          employees_with_skill: result.records?.filter(r => r.emp && r.target_skill).length || 0,
          capability_connections: result.records?.filter(r => r.capabilities && r.capabilities.length > 0).length || 0
        }
      },
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('❌ Capability paths query error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find capability paths',
      skill: skill,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Get knowledge graph statistics and health information
 */
export async function getKnowledgeGraphStats() {
  try {
    // Simple stats query that doesn't use dangerous operations
    const statsQuery = `
      MATCH (n)
      WITH labels(n) as node_labels
      UNWIND node_labels as label
      WITH label, count(*) as node_count
      WITH collect({label: label, count: node_count}) as node_stats
      
      MATCH ()-[r]->()
      WITH node_stats, type(r) as rel_type
      WITH node_stats, rel_type, count(*) as rel_count
      WITH node_stats, collect({type: rel_type, count: rel_count}) as relationship_stats
      
      RETURN {
        nodes: node_stats,
        relationships: relationship_stats,
        total_nodes: reduce(total = 0, stat IN node_stats | total + stat.count),
        total_relationships: reduce(total = 0, stat IN relationship_stats | total + stat.count)
      } as stats
      LIMIT 1
    `

    const result = await queryKnowledgeGraph({
      query: statsQuery,
      limit: 1
    })

    return {
      success: result.success,
      knowledge_graph_stats: result.success && result.records && result.records.length > 0 ? result.records[0]?.stats : null,
      error: result.error,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('❌ Knowledge graph stats error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve knowledge graph statistics',
      timestamp: new Date().toISOString()
    }
  }
}