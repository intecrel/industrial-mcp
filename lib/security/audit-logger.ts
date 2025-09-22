/**
 * Comprehensive Audit Logging for OAuth and Security Events
 * Provides structured logging for compliance and security monitoring
 */

export interface AuditEvent {
  timestamp: string;
  event_type: string;
  user_id?: string;
  user_email?: string | null;
  client_id?: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  resource?: string;
  action: string;
  result: 'success' | 'failure' | 'warning';
  details?: Record<string, any>;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Specialized audit event interface for database operations
 */
export interface DatabaseAuditEvent extends AuditEvent {
  database_type: 'neo4j' | 'mysql';
  operation_type: 'CREATE' | 'MERGE' | 'SET' | 'READ';
  query_hash: string; // SHA256 hash of the executed query
  affected_nodes: number;
  affected_relationships: number;
  execution_time_ms: number;
  before_state?: any; // State before operation (for SET operations)
  after_state?: any;  // State after operation
  complexity_score: number; // Query complexity rating (0-100)
  transaction_id?: string; // Transaction identifier if part of transaction
  query_parameters?: Record<string, any>; // Sanitized query parameters
}

export enum AuditEventType {
  // Authentication Events
  AUTH_LOGIN_SUCCESS = 'auth.login.success',
  AUTH_LOGIN_FAILURE = 'auth.login.failure',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_SESSION_EXPIRED = 'auth.session.expired',

  // OAuth Events
  OAUTH_AUTHORIZE_REQUEST = 'oauth.authorize.request',
  OAUTH_CONSENT_GRANTED = 'oauth.consent.granted',
  OAUTH_CONSENT_DENIED = 'oauth.consent.denied',
  OAUTH_TOKEN_ISSUED = 'oauth.token.issued',
  OAUTH_TOKEN_REVOKED = 'oauth.token.revoked',

  // Security Events
  SECURITY_CSRF_VALIDATION_FAILED = 'security.csrf.validation_failed',
  SECURITY_RATE_LIMIT_EXCEEDED = 'security.rate_limit.exceeded',
  SECURITY_UNAUTHORIZED_ACCESS = 'security.unauthorized.access',
  SECURITY_SUSPICIOUS_ACTIVITY = 'security.suspicious.activity',

  // Database Events - Neo4j Operations
  DB_NEO4J_CREATE_NODE = 'database.neo4j.create_node',
  DB_NEO4J_CREATE_RELATIONSHIP = 'database.neo4j.create_relationship',
  DB_NEO4J_MERGE_OPERATION = 'database.neo4j.merge_operation',
  DB_NEO4J_SET_PROPERTY = 'database.neo4j.set_property',
  DB_NEO4J_QUERY_EXECUTED = 'database.neo4j.query_executed',
  DB_NEO4J_TRANSACTION_STARTED = 'database.neo4j.transaction_started',
  DB_NEO4J_TRANSACTION_COMMITTED = 'database.neo4j.transaction_committed',
  DB_NEO4J_TRANSACTION_ROLLED_BACK = 'database.neo4j.transaction_rolled_back',
  DB_NEO4J_DANGEROUS_OPERATION_BLOCKED = 'database.neo4j.dangerous_operation_blocked',

  // System Events
  SYSTEM_ERROR = 'system.error',
  SYSTEM_CONFIG_CHANGE = 'system.config.change',
}

/**
 * Extract client information from request
 */
function extractClientInfo(request: Request): {
  ip_address?: string;
  user_agent?: string;
} {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  const ip_address = forwardedFor?.split(',')[0] || realIp || cfConnectingIp;
  const user_agent = request.headers.get('user-agent');
  
  return {
    ip_address: ip_address || undefined,
    user_agent: user_agent || undefined
  };
}

/**
 * Log an audit event with configurable storage
 */
export async function logAuditEvent(event: Omit<AuditEvent, 'timestamp'>): Promise<void> {
  const auditEvent: AuditEvent = {
    timestamp: new Date().toISOString(),
    ...event
  };

  try {
    // Use configurable audit storage
    const { storeAuditEvent } = await import('../database/audit-storage');
    await storeAuditEvent(auditEvent);
  } catch (error) {
    // Fallback to console logging if storage fails
    console.error('❌ Audit storage failed, falling back to console:', error);

    const logLevel = event.risk_level === 'critical' || event.risk_level === 'high' ? 'error' :
                     event.risk_level === 'medium' ? 'warn' : 'info';

    const logMessage = {
      audit: true,
      storage_fallback: true,
      ...auditEvent
    };

    console[logLevel](`[AUDIT] ${JSON.stringify(logMessage)}`);

    // Alert on high-risk events
    if (event.risk_level === 'critical' || event.risk_level === 'high') {
      console.error(`🚨 HIGH RISK AUDIT EVENT: ${event.event_type} - ${event.action}`);
    }
  }
}

/**
 * Create audit logger for specific context
 */
export function createAuditLogger(
  request: Request,
  user?: { id?: string; email?: string | null },
  sessionId?: string
) {
  const clientInfo = extractClientInfo(request);
  
  return {
    log: async (eventType: AuditEventType, action: string, result: AuditEvent['result'], details?: Record<string, any>, riskLevel: AuditEvent['risk_level'] = 'low') => {
      await logAuditEvent({
        event_type: eventType,
        user_id: user?.id || user?.email || undefined,
        user_email: user?.email || undefined,
        session_id: sessionId,
        action,
        result,
        details,
        risk_level: riskLevel,
        ...clientInfo
      });
    },

    logOAuthEvent: async (eventType: AuditEventType, action: string, clientId: string, result: AuditEvent['result'], details?: Record<string, any>, riskLevel: AuditEvent['risk_level'] = 'medium') => {
      await logAuditEvent({
        event_type: eventType,
        user_id: user?.id || user?.email || undefined,
        user_email: user?.email || undefined,
        client_id: clientId,
        session_id: sessionId,
        action,
        result,
        details,
        risk_level: riskLevel,
        ...clientInfo
      });
    },

    logSecurityEvent: async (eventType: AuditEventType, action: string, result: AuditEvent['result'], details?: Record<string, any>, riskLevel: AuditEvent['risk_level'] = 'high') => {
      await logAuditEvent({
        event_type: eventType,
        user_id: user?.id || user?.email || undefined,
        user_email: user?.email || undefined,
        session_id: sessionId,
        action,
        result,
        details,
        risk_level: riskLevel,
        ...clientInfo
      });
    }
  };
}

/**
 * Log OAuth consent decision
 */
export async function logOAuthConsent(
  request: Request,
  user: { id?: string; email?: string | null },
  clientId: string,
  approved: boolean,
  scopes: string[],
  sessionId?: string
): Promise<void> {
  const logger = createAuditLogger(request, user, sessionId);

  await logger.logOAuthEvent(
    approved ? AuditEventType.OAUTH_CONSENT_GRANTED : AuditEventType.OAUTH_CONSENT_DENIED,
    `OAuth consent ${approved ? 'granted' : 'denied'} for client ${clientId}`,
    clientId,
    'success',
    {
      scopes,
      approved,
      consent_timestamp: new Date().toISOString()
    },
    approved ? 'medium' : 'low'
  );
}

/**
 * Log security violation
 */
export async function logSecurityViolation(
  request: Request,
  violation: string,
  details?: Record<string, any>,
  user?: { id?: string; email?: string | null }
): Promise<void> {
  const logger = createAuditLogger(request, user);

  await logger.logSecurityEvent(
    AuditEventType.SECURITY_SUSPICIOUS_ACTIVITY,
    `Security violation detected: ${violation}`,
    'failure',
    details,
    'high'
  );
}

/**
 * Create a SHA256 hash of query for audit logging
 */
function createQueryHash(query: string): string {
  // Simple hash implementation for audit purposes
  // In production, use crypto.createHash('sha256')
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Sanitize query parameters for audit logging (remove sensitive data)
 */
function sanitizeParameters(params: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    // Mask potentially sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    const isSensitive = sensitiveFields.some(field =>
      key.toLowerCase().includes(field)
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = value.substring(0, 100) + '...[TRUNCATED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log database operation audit event with configurable storage
 */
export async function logDatabaseOperation(
  eventType: AuditEventType,
  action: string,
  result: DatabaseAuditEvent['result'],
  databaseType: 'neo4j' | 'mysql',
  operationType: 'CREATE' | 'MERGE' | 'SET' | 'READ',
  query: string,
  executionTimeMs: number,
  affectedNodes: number = 0,
  affectedRelationships: number = 0,
  complexityScore: number = 0,
  beforeState?: any,
  afterState?: any,
  parameters?: Record<string, any>,
  transactionId?: string,
  user?: { id?: string; email?: string | null },
  clientInfo?: { ip_address?: string; user_agent?: string }
): Promise<void> {
  const databaseAuditEvent: Omit<DatabaseAuditEvent, 'timestamp'> = {
    event_type: eventType,
    user_id: user?.id || user?.email || undefined,
    user_email: user?.email || undefined,
    action,
    result,
    database_type: databaseType,
    operation_type: operationType,
    query_hash: createQueryHash(query),
    affected_nodes: affectedNodes,
    affected_relationships: affectedRelationships,
    execution_time_ms: executionTimeMs,
    complexity_score: complexityScore,
    before_state: beforeState,
    after_state: afterState,
    query_parameters: parameters ? sanitizeParameters(parameters) : undefined,
    transaction_id: transactionId,
    risk_level: determineRiskLevel(operationType, affectedNodes, affectedRelationships, complexityScore),
    ip_address: clientInfo?.ip_address,
    user_agent: clientInfo?.user_agent,
    details: {
      query_length: query.length,
      has_transaction: !!transactionId,
      parameter_count: parameters ? Object.keys(parameters).length : 0
    }
  };

  try {
    // Use configurable database audit storage
    const { storeDatabaseAuditEvent } = await import('../database/audit-storage');
    await storeDatabaseAuditEvent(databaseAuditEvent as DatabaseAuditEvent);
  } catch (error) {
    // Fallback to regular audit logging
    console.error('❌ Database audit storage failed, using fallback:', error);
    await logAuditEvent(databaseAuditEvent);
  }
}

/**
 * Determine risk level for database operations
 */
function determineRiskLevel(
  operationType: string,
  affectedNodes: number,
  affectedRelationships: number,
  complexityScore: number
): DatabaseAuditEvent['risk_level'] {
  const totalAffected = affectedNodes + affectedRelationships;

  // High risk: Large operations or high complexity
  if (totalAffected > 1000 || complexityScore > 80) {
    return 'high';
  }

  // Medium risk: Write operations or moderate size
  if (operationType !== 'READ' || totalAffected > 100 || complexityScore > 50) {
    return 'medium';
  }

  // Low risk: Small read operations
  return 'low';
}

/**
 * Create database audit logger for specific context
 */
export function createDatabaseAuditLogger(
  databaseType: 'neo4j' | 'mysql',
  user?: { id?: string; email?: string | null },
  clientInfo?: { ip_address?: string; user_agent?: string },
  transactionId?: string
) {
  return {
    logQuery: async (
      query: string,
      operationType: 'CREATE' | 'MERGE' | 'SET' | 'READ',
      result: DatabaseAuditEvent['result'],
      executionTimeMs: number,
      affectedNodes: number = 0,
      affectedRelationships: number = 0,
      complexityScore: number = 0,
      beforeState?: any,
      afterState?: any,
      parameters?: Record<string, any>
    ) => {
      const eventType = getEventTypeForOperation(databaseType, operationType);
      await logDatabaseOperation(
        eventType,
        `${operationType} operation on ${databaseType}`,
        result,
        databaseType,
        operationType,
        query,
        executionTimeMs,
        affectedNodes,
        affectedRelationships,
        complexityScore,
        beforeState,
        afterState,
        parameters,
        transactionId,
        user,
        clientInfo
      );
    },

    logTransaction: async (action: 'START' | 'COMMIT' | 'ROLLBACK', result: DatabaseAuditEvent['result']) => {
      const eventType = action === 'START' ? AuditEventType.DB_NEO4J_TRANSACTION_STARTED :
                      action === 'COMMIT' ? AuditEventType.DB_NEO4J_TRANSACTION_COMMITTED :
                      AuditEventType.DB_NEO4J_TRANSACTION_ROLLED_BACK;

      await logAuditEvent({
        event_type: eventType,
        user_id: user?.id || user?.email || undefined,
        user_email: user?.email || undefined,
        action: `Transaction ${action.toLowerCase()}`,
        result,
        risk_level: action === 'ROLLBACK' ? 'medium' : 'low',
        ip_address: clientInfo?.ip_address,
        user_agent: clientInfo?.user_agent,
        details: {
          transaction_id: transactionId,
          database_type: databaseType
        }
      });
    },

    logDangerousOperationBlocked: async (query: string, reason: string) => {
      await logAuditEvent({
        event_type: AuditEventType.DB_NEO4J_DANGEROUS_OPERATION_BLOCKED,
        user_id: user?.id || user?.email || undefined,
        user_email: user?.email || undefined,
        action: `Blocked dangerous database operation: ${reason}`,
        result: 'warning',
        risk_level: 'high',
        ip_address: clientInfo?.ip_address,
        user_agent: clientInfo?.user_agent,
        details: {
          blocked_query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
          block_reason: reason,
          database_type: databaseType
        }
      });
    }
  };
}

/**
 * Get appropriate event type for database operation
 */
function getEventTypeForOperation(databaseType: string, operationType: string): AuditEventType {
  if (databaseType === 'neo4j') {
    switch (operationType) {
      case 'CREATE':
        return AuditEventType.DB_NEO4J_CREATE_NODE;
      case 'MERGE':
        return AuditEventType.DB_NEO4J_MERGE_OPERATION;
      case 'SET':
        return AuditEventType.DB_NEO4J_SET_PROPERTY;
      default:
        return AuditEventType.DB_NEO4J_QUERY_EXECUTED;
    }
  }

  return AuditEventType.DB_NEO4J_QUERY_EXECUTED; // Fallback
}