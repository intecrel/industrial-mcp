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
 * Log an audit event
 */
export function logAuditEvent(event: Omit<AuditEvent, 'timestamp'>): void {
  const auditEvent: AuditEvent = {
    timestamp: new Date().toISOString(),
    ...event
  };
  
  // For production, integrate with your logging service (DataDog, Splunk, etc.)
  // For now, using structured console logging with specific prefix for filtering
  const logLevel = event.risk_level === 'critical' || event.risk_level === 'high' ? 'error' : 
                   event.risk_level === 'medium' ? 'warn' : 'info';
  
  const logMessage = {
    audit: true,
    ...auditEvent
  };
  
  console[logLevel](`[AUDIT] ${JSON.stringify(logMessage)}`);
  
  // Alert on high-risk events
  if (event.risk_level === 'critical' || event.risk_level === 'high') {
    console.error(`🚨 HIGH RISK AUDIT EVENT: ${event.event_type} - ${event.action}`);
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
    log: (eventType: AuditEventType, action: string, result: AuditEvent['result'], details?: Record<string, any>, riskLevel: AuditEvent['risk_level'] = 'low') => {
      logAuditEvent({
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

    logOAuthEvent: (eventType: AuditEventType, action: string, clientId: string, result: AuditEvent['result'], details?: Record<string, any>, riskLevel: AuditEvent['risk_level'] = 'medium') => {
      logAuditEvent({
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

    logSecurityEvent: (eventType: AuditEventType, action: string, result: AuditEvent['result'], details?: Record<string, any>, riskLevel: AuditEvent['risk_level'] = 'high') => {
      logAuditEvent({
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
export function logOAuthConsent(
  request: Request,
  user: { id?: string; email?: string | null },
  clientId: string,
  approved: boolean,
  scopes: string[],
  sessionId?: string
): void {
  const logger = createAuditLogger(request, user, sessionId);
  
  logger.logOAuthEvent(
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
export function logSecurityViolation(
  request: Request,
  violation: string,
  details?: Record<string, any>,
  user?: { id?: string; email?: string | null }
): void {
  const logger = createAuditLogger(request, user);
  
  logger.logSecurityEvent(
    AuditEventType.SECURITY_SUSPICIOUS_ACTIVITY,
    `Security violation detected: ${violation}`,
    'failure',
    details,
    'high'
  );
}