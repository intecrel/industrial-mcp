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
import { createDatabaseAuditLogger, AuditEventType } from '../../../../lib/security/audit-logger'

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

// Operation Classification System
enum OperationType {
  READ = 'READ',
  CREATE = 'CREATE',
  MERGE = 'MERGE',
  SET = 'SET',
  FORBIDDEN = 'FORBIDDEN'
}

enum PermissionLevel {
  LEVEL_1_READ_ONLY = 1,        // READ operations + basic CREATE nodes
  LEVEL_2_AUTHENTICATED = 2,    // + CREATE relationships + MERGE operations
  LEVEL_3_ELEVATED = 3,         // + SET property operations with full audit
  LEVEL_4_ADMIN = 4            // Reserved for future schema operations
}

// Completely forbidden operations (NO DELETE POLICY)
const FORBIDDEN_KEYWORDS = [
  'DROP', 'DELETE', 'REMOVE', 'DETACH DELETE', 'CREATE CONSTRAINT',
  'DROP CONSTRAINT', 'CREATE INDEX', 'DROP INDEX', 'CALL dbms',
  'CALL db.', 'LOAD CSV', 'USING PERIODIC COMMIT', 'FOREACH'
]

// Permission-based operation allowlist
const OPERATION_PERMISSIONS: Record<PermissionLevel, string[]> = {
  [PermissionLevel.LEVEL_1_READ_ONLY]: [
    'MATCH', 'RETURN', 'WITH', 'OPTIONAL MATCH', 'WHERE', 'ORDER BY', 'LIMIT', 'UNWIND',
    'CREATE (' // Only CREATE nodes, not relationships
  ],
  [PermissionLevel.LEVEL_2_AUTHENTICATED]: [
    'MATCH', 'RETURN', 'WITH', 'OPTIONAL MATCH', 'WHERE', 'ORDER BY', 'LIMIT', 'UNWIND',
    'CREATE (', 'CREATE -', 'CREATE ]->', 'MERGE'
  ],
  [PermissionLevel.LEVEL_3_ELEVATED]: [
    'MATCH', 'RETURN', 'WITH', 'OPTIONAL MATCH', 'WHERE', 'ORDER BY', 'LIMIT', 'UNWIND',
    'CREATE (', 'CREATE -', 'CREATE ]->', 'MERGE', 'SET'
  ],
  [PermissionLevel.LEVEL_4_ADMIN]: [
    // Reserved for future schema operations via separate interface
    'MATCH', 'RETURN', 'WITH', 'OPTIONAL MATCH', 'WHERE', 'ORDER BY', 'LIMIT', 'UNWIND',
    'CREATE (', 'CREATE -', 'CREATE ]->', 'MERGE', 'SET'
  ]
}

/**
 * Classify the type of Cypher operation
 */
function classifyOperation(query: string): OperationType {
  const upperQuery = query.toUpperCase().trim()

  // Check for forbidden operations first
  for (const forbidden of FORBIDDEN_KEYWORDS) {
    if (upperQuery.includes(forbidden.toUpperCase())) {
      return OperationType.FORBIDDEN
    }
  }

  // Classify allowed operations
  if (upperQuery.includes('SET ')) {
    return OperationType.SET
  }
  if (upperQuery.includes('MERGE ')) {
    return OperationType.MERGE
  }
  if (upperQuery.includes('CREATE ')) {
    return OperationType.CREATE
  }

  return OperationType.READ
}

/**
 * Get current user permission level (for now, defaulting to Level 2)
 * TODO: Implement API key-based permission detection
 */
function getCurrentPermissionLevel(): PermissionLevel {
  // For Phase 1 implementation, default to Level 2 (authenticated)
  // Later phases will implement API key-based permission levels
  return PermissionLevel.LEVEL_2_AUTHENTICATED
}

/**
 * Enhanced Cypher query validation with operation classification and permissions
 */
function validateCypherQuery(
  query: string,
  permissionLevel: PermissionLevel = getCurrentPermissionLevel()
): {
  isValid: boolean;
  sanitized: string;
  operationType: OperationType;
  error?: string;
  complexityScore?: number;
} {
  try {
    // Remove comments and normalize whitespace
    const normalized = query
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/\/\/.*$/gm, '') // Remove // comments
      .replace(/\s+/g, ' ')
      .trim()

    if (normalized.length === 0) {
      return {
        isValid: false,
        sanitized: '',
        operationType: OperationType.FORBIDDEN,
        error: 'Query cannot be empty'
      }
    }

    // Classify the operation
    const operationType = classifyOperation(normalized)

    // Check for forbidden operations
    if (operationType === OperationType.FORBIDDEN) {
      const upperQuery = normalized.toUpperCase()
      for (const forbidden of FORBIDDEN_KEYWORDS) {
        if (upperQuery.includes(forbidden.toUpperCase())) {
          return {
            isValid: false,
            sanitized: '',
            operationType: OperationType.FORBIDDEN,
            error: `Forbidden operation detected: ${forbidden} operations are not allowed`
          }
        }
      }
    }

    // Check permission-based access
    const allowedOperations = OPERATION_PERMISSIONS[permissionLevel]
    const upperQuery = normalized.toUpperCase()

    let hasPermission = false

    // Check if query contains allowed operations for this permission level
    for (const allowedOp of allowedOperations) {
      if (upperQuery.includes(allowedOp.toUpperCase())) {
        hasPermission = true
        break
      }
    }

    if (!hasPermission) {
      return {
        isValid: false,
        sanitized: '',
        operationType,
        error: `Operation ${operationType} requires permission level ${getRequiredPermissionLevel(operationType)} or higher. Current level: ${permissionLevel}`
      }
    }

    // Additional validation for write operations
    if (operationType !== OperationType.READ) {
      // Ensure write operations have proper structure
      if (!normalized.includes('RETURN') && !normalized.includes('MERGE') && !normalized.includes('SET')) {
        // Allow CREATE operations without RETURN
        if (operationType !== OperationType.CREATE) {
          return {
            isValid: false,
            sanitized: '',
            operationType,
            error: 'Write operations should include proper result handling'
          }
        }
      }

      // Complexity check for write operations
      const complexity = estimateQueryComplexity(normalized)
      if (complexity > 80) {
        return {
          isValid: false,
          sanitized: '',
          operationType,
          error: `Query complexity too high (${complexity}/100). Maximum allowed: 80`
        }
      }
    }

    return {
      isValid: true,
      sanitized: normalized,
      operationType,
      complexityScore: estimateQueryComplexity(normalized)
    }
  } catch (error) {
    return {
      isValid: false,
      sanitized: '',
      operationType: OperationType.FORBIDDEN,
      error: `Query validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Get required permission level for operation type
 */
function getRequiredPermissionLevel(operationType: OperationType): PermissionLevel {
  switch (operationType) {
    case OperationType.READ:
      return PermissionLevel.LEVEL_1_READ_ONLY
    case OperationType.CREATE:
      return PermissionLevel.LEVEL_2_AUTHENTICATED
    case OperationType.MERGE:
      return PermissionLevel.LEVEL_2_AUTHENTICATED
    case OperationType.SET:
      return PermissionLevel.LEVEL_3_ELEVATED
    default:
      return PermissionLevel.LEVEL_4_ADMIN
  }
}

/**
 * Estimate query complexity (simplified version for initial implementation)
 */
function estimateQueryComplexity(query: string): number {
  let complexity = 0
  const upperQuery = query.toUpperCase()

  // Base complexity for operations
  if (upperQuery.includes('MATCH')) complexity += 10
  if (upperQuery.includes('CREATE')) complexity += 20
  if (upperQuery.includes('MERGE')) complexity += 30
  if (upperQuery.includes('SET')) complexity += 15

  // Relationship complexity
  const relationshipCount = (query.match(/--\>|<--|--/g) || []).length
  complexity += relationshipCount * 5

  // Query length factor
  complexity += Math.floor(query.length / 100) * 5

  // Optional operations add complexity
  if (upperQuery.includes('OPTIONAL MATCH')) complexity += 15

  // Path traversal complexity
  const pathTraversals = (query.match(/\*[0-9]+\.\.[0-9]+/g) || []).length
  complexity += pathTraversals * 20

  return Math.min(complexity, 100)
}

/**
 * Execute parameterized Cypher queries against the knowledge graph with comprehensive audit trails
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
  const startTime = Date.now()
  let auditLogger: ReturnType<typeof createDatabaseAuditLogger> | null = null

  try {
    const dbManager = await getGlobalDatabaseManager()
    const neo4j = dbManager.getConnection('neo4j') // Get Neo4j connection by name

    if (!neo4j.isConnected) {
      await neo4j.connect()
    }

    // Create audit logger for this operation
    auditLogger = createDatabaseAuditLogger(
      'neo4j',
      undefined, // TODO: Extract user info from request context
      undefined  // TODO: Extract client info from request context
    )

    // Enhanced validation with operation classification
    const validation = validateCypherQuery(query)
    if (!validation.isValid) {
      // Log blocked dangerous operation
      if (validation.operationType === OperationType.FORBIDDEN) {
        auditLogger.logDangerousOperationBlocked(query, validation.error || 'Forbidden operation')
      }
      throw new Error(`Query validation failed: ${validation.error}`)
    }

    console.log(`🔍 Executing ${validation.operationType} operation: ${validation.sanitized.substring(0, 100)}...`)
    console.log(`📊 Parameters:`, parameters)
    console.log(`🎯 Complexity Score: ${validation.complexityScore}/100`)

    // Add LIMIT to prevent large result sets
    let finalQuery = validation.sanitized
    if (limit && limit > 0 && !finalQuery.toUpperCase().includes('LIMIT')) {
      finalQuery += ` LIMIT ${Math.min(limit, 1000)}` // Cap at 1000 for safety
    }

    // Execute query with state capture for write operations
    const isWriteOperation = validation.operationType !== OperationType.READ
    const result = isWriteOperation
      ? await (neo4j as any).queryWithAuditCapture(finalQuery, parameters, true)
      : await neo4j.query(finalQuery, parameters)

    const executionTime = Date.now() - startTime

    if (!result.success) {
      // Log failed operation
      auditLogger.logQuery(
        finalQuery,
        validation.operationType as any,
        'failure',
        executionTime,
        0,
        0,
        validation.complexityScore || 0,
        result.beforeState,
        result.afterState,
        parameters
      )
      throw new Error(result.error || 'Query execution failed')
    }

    // Estimate affected entities
    const affected = (neo4j as any).estimateAffectedEntities ?
      (neo4j as any).estimateAffectedEntities(result) : { nodes: 0, relationships: 0 }

    // Log successful operation with full audit trail
    auditLogger.logQuery(
      finalQuery,
      validation.operationType as any,
      'success',
      executionTime,
      affected.nodes,
      affected.relationships,
      validation.complexityScore || 0,
      result.beforeState,
      result.afterState,
      parameters
    )

    return {
      success: true,
      operation_type: validation.operationType,
      query: finalQuery,
      records: result.data,
      count: result.data?.length || 0,
      metadata: result.metadata,
      execution_time_ms: executionTime,
      complexity_score: validation.complexityScore,
      affected_entities: affected,
      audit_trail: {
        before_state: result.beforeState,
        after_state: result.afterState,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    const executionTime = Date.now() - startTime
    console.error('❌ Neo4j query error:', error)

    // Log error if audit logger is available
    if (auditLogger) {
      auditLogger.logQuery(
        query,
        'READ' as any, // Default for error cases
        'failure',
        executionTime,
        0,
        0,
        0,
        undefined,
        undefined,
        parameters
      )
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      query: query,
      execution_time_ms: executionTime,
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
          employees_with_skill: result.records?.filter((r: any) => r.emp && r.target_skill).length || 0,
          capability_connections: result.records?.filter((r: any) => r.capabilities && r.capabilities.length > 0).length || 0
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