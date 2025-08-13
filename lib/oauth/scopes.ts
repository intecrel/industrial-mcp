/**
 * OAuth 2.1 Scope Definitions and Tool Access Control
 * Defines what tools each scope can access
 */

export interface ScopeDefinition {
  description: string;
  tools: string[];
}

/**
 * Supported OAuth scopes and their tool access mappings
 */
export const SUPPORTED_SCOPES: Record<string, ScopeDefinition> = {
  'read:analytics': {
    description: 'Read access to analytics data and visitor metrics from Matomo database',
    tools: [
      'query_matomo_database',
      'get_visitor_analytics', 
      'get_conversion_metrics',
      'get_content_performance',
      'get_company_intelligence',
      'explore_database', // For analytics database exploration
      'query_database', // For analytics database queries
      'analyze_data', // For analytics data analysis
    ]
  },
  'read:knowledge': {
    description: 'Read access to knowledge graph and organizational data from Neo4j',
    tools: [
      'query_knowledge_graph',
      'get_organizational_structure', 
      'find_capability_paths',
      'get_knowledge_graph_stats',
      'get_unified_dashboard_data', // Cross-database tool
      'correlate_operational_relationships', // Cross-database tool
    ]
  },
  'admin:usage': {
    description: 'Administrative access to usage analytics and system status information',
    tools: [
      'get_usage_analytics',
      'get_cloud_sql_status',
      'get_cloud_sql_info',
      'echo', // Basic testing tool
    ]
  }
} as const;

/**
 * Get all tools accessible by given scopes
 */
export const getToolsForScopes = (scopes: string[]): string[] => {
  const tools = new Set<string>();
  
  for (const scope of scopes) {
    const scopeDefinition = SUPPORTED_SCOPES[scope];
    if (scopeDefinition) {
      scopeDefinition.tools.forEach(tool => tools.add(tool));
    }
  }
  
  return Array.from(tools);
};

/**
 * Check if a tool is accessible with given scopes
 */
export const isToolAccessible = (toolName: string, scopes: string[]): boolean => {
  return getToolsForScopes(scopes).includes(toolName);
};

/**
 * Validate scope string format and existence
 */
export const validateScopes = (scopeString: string): { valid: boolean; scopes: string[]; errors: string[] } => {
  const errors: string[] = [];
  const scopes = scopeString.split(' ').filter(s => s.length > 0);
  
  if (scopes.length === 0) {
    errors.push('At least one scope is required');
    return { valid: false, scopes: [], errors };
  }
  
  const invalidScopes = scopes.filter(scope => !SUPPORTED_SCOPES[scope]);
  if (invalidScopes.length > 0) {
    errors.push(`Invalid scopes: ${invalidScopes.join(', ')}`);
  }
  
  const validScopes = scopes.filter(scope => SUPPORTED_SCOPES[scope]);
  
  return {
    valid: errors.length === 0,
    scopes: validScopes,
    errors
  };
};

/**
 * Get scope descriptions for documentation/UI
 */
export const getScopeDescriptions = (): Record<string, string> => {
  const descriptions: Record<string, string> = {};
  for (const [scope, definition] of Object.entries(SUPPORTED_SCOPES)) {
    descriptions[scope] = definition.description;
  }
  return descriptions;
};