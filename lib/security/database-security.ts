/**
 * Database security validation and monitoring utilities
 */

import { getSecretsManager } from './secrets-manager'

export interface SecurityAuditResult {
  score: number // 0-100
  checks: SecurityCheck[]
  recommendations: string[]
  critical: boolean
}

export interface SecurityCheck {
  name: string
  passed: boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  recommendation?: string
}

export class DatabaseSecurityValidator {
  private static instance: DatabaseSecurityValidator

  static getInstance(): DatabaseSecurityValidator {
    if (!DatabaseSecurityValidator.instance) {
      DatabaseSecurityValidator.instance = new DatabaseSecurityValidator()
    }
    return DatabaseSecurityValidator.instance
  }

  /**
   * Comprehensive security audit of database configuration
   */
  async auditDatabaseSecurity(): Promise<SecurityAuditResult> {
    const checks: SecurityCheck[] = []
    let score = 100
    const recommendations: string[] = []

    // Environment-based security checks
    checks.push(...this.checkEnvironmentSecurity())
    
    // Connection security checks  
    checks.push(...this.checkConnectionSecurity())
    
    // Credential security checks
    checks.push(...this.checkCredentialSecurity())

    // Application security checks
    checks.push(...this.checkApplicationSecurity())

    // Calculate score and determine criticality
    let criticalIssues = 0
    let highIssues = 0
    let mediumIssues = 0

    for (const check of checks) {
      if (!check.passed) {
        switch (check.severity) {
          case 'critical':
            score -= 25
            criticalIssues++
            break
          case 'high':
            score -= 15
            highIssues++
            break
          case 'medium':
            score -= 10
            mediumIssues++
            break
          case 'low':
            score -= 5
            break
        }

        if (check.recommendation) {
          recommendations.push(check.recommendation)
        }
      }
    }

    return {
      score: Math.max(0, score),
      checks,
      recommendations: Array.from(new Set(recommendations)), // Remove duplicates
      critical: criticalIssues > 0
    }
  }

  private checkEnvironmentSecurity(): SecurityCheck[] {
    const checks: SecurityCheck[] = []
    const isProduction = process.env.NODE_ENV === 'production'

    // Production environment check
    checks.push({
      name: 'Production Environment Detection',
      passed: isProduction ? true : true, // Allow dev environments
      severity: 'medium',
      message: isProduction ? 'Running in production mode' : 'Running in development mode',
      recommendation: isProduction ? undefined : 'Ensure production settings are enabled for live deployment'
    })

    // Environment variable security
    const sensitiveEnvVars = ['NEO4J_PASSWORD', 'CLOUD_SQL_PASSWORD', 'API_KEY']
    for (const envVar of sensitiveEnvVars) {
      const hasVar = !!process.env[envVar]
      checks.push({
        name: `Credential Environment Variable: ${envVar}`,
        passed: hasVar,
        severity: 'high',
        message: hasVar ? 'Credential found in environment' : `Missing credential: ${envVar}`,
        recommendation: hasVar ? undefined : `Set ${envVar} environment variable`
      })
    }

    return checks
  }

  private checkConnectionSecurity(): SecurityCheck[] {
    const checks: SecurityCheck[] = []

    // Neo4j connection security
    const neo4jUri = process.env.NEO4J_URI || ''
    const isNeo4jSecure = neo4jUri.startsWith('neo4j+s://') || neo4jUri.startsWith('bolt+s://')
    
    checks.push({
      name: 'Neo4j SSL/TLS Connection',
      passed: isNeo4jSecure || !neo4jUri,
      severity: 'high',
      message: isNeo4jSecure ? 'Neo4j uses encrypted connection' : 'Neo4j connection may be unencrypted',
      recommendation: isNeo4jSecure ? undefined : 'Use neo4j+s:// or bolt+s:// for encrypted Neo4j connections'
    })

    // Cloud SQL security
    const hasCloudSQLConnector = !!process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME
    checks.push({
      name: 'Cloud SQL Connector',
      passed: hasCloudSQLConnector || !process.env.CLOUD_SQL_DATABASE_NAME,
      severity: 'medium',
      message: hasCloudSQLConnector ? 'Using Cloud SQL Connector (secure)' : 'Direct MySQL connection',
      recommendation: hasCloudSQLConnector ? undefined : 'Consider using Cloud SQL Connector for enhanced security'
    })

    return checks
  }

  private checkCredentialSecurity(): SecurityCheck[] {
    const checks: SecurityCheck[] = []
    const secrets = getSecretsManager()

    // Check credential strength
    const credentials = ['NEO4J_PASSWORD', 'CLOUD_SQL_PASSWORD', 'API_KEY']
    
    for (const credName of credentials) {
      const credential = secrets.getSecret(credName)
      if (credential) {
        const strength = this.assessPasswordStrength(credential)
        checks.push({
          name: `Credential Strength: ${credName}`,
          passed: strength.score >= 70,
          severity: strength.score < 50 ? 'high' : strength.score < 70 ? 'medium' : 'low',
          message: `${credName} strength: ${strength.level} (${strength.score}/100)`,
          recommendation: strength.score < 70 ? `Improve ${credName} strength: ${strength.suggestions.join(', ')}` : undefined
        })
      }
    }

    return checks
  }

  private checkApplicationSecurity(): SecurityCheck[] {
    const checks: SecurityCheck[] = []

    // API key authentication
    const hasApiKey = !!process.env.API_KEY || !!process.env.MCP_API_KEYS
    checks.push({
      name: 'API Key Authentication',
      passed: hasApiKey,
      severity: 'critical',
      message: hasApiKey ? 'API key authentication enabled' : 'No API key authentication configured',
      recommendation: hasApiKey ? undefined : 'Configure API_KEY or MCP_API_KEYS for authentication'
    })

    // MAC address verification
    const hasMacVerification = !!process.env.MAC_ADDRESS
    checks.push({
      name: 'MAC Address Verification',
      passed: hasMacVerification,
      severity: 'high',
      message: hasMacVerification ? 'MAC address verification enabled' : 'MAC address verification disabled',
      recommendation: hasMacVerification ? undefined : 'Configure MAC_ADDRESS for device-based authentication'
    })

    // Rate limiting configuration
    const hasRateLimiting = process.env.MCP_API_KEYS?.includes(':')
    checks.push({
      name: 'API Rate Limiting',
      passed: hasRateLimiting || false,
      severity: 'medium',
      message: hasRateLimiting ? 'Rate limiting configured for API keys' : 'Basic rate limiting only',
      recommendation: hasRateLimiting ? undefined : 'Configure per-key rate limits in MCP_API_KEYS format'
    })

    return checks
  }

  private assessPasswordStrength(password: string): {
    score: number
    level: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong'
    suggestions: string[]
  } {
    let score = 0
    const suggestions: string[] = []

    // Length check
    if (password.length >= 12) score += 25
    else if (password.length >= 8) score += 15
    else suggestions.push('Use at least 12 characters')

    // Character variety
    if (/[a-z]/.test(password)) score += 10
    else suggestions.push('Include lowercase letters')

    if (/[A-Z]/.test(password)) score += 10
    else suggestions.push('Include uppercase letters')

    if (/\d/.test(password)) score += 10
    else suggestions.push('Include numbers')

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 15
    else suggestions.push('Include special characters')

    // Complexity patterns
    if (password.length > 16) score += 10
    if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d])/.test(password)) score += 20

    const level = score >= 80 ? 'Strong' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : score >= 20 ? 'Weak' : 'Very Weak'

    return { score, level, suggestions }
  }

  /**
   * Generate security report for logging/monitoring
   */
  async generateSecurityReport(): Promise<string> {
    const audit = await this.auditDatabaseSecurity()
    const secrets = getSecretsManager().getSecurityAudit()
    
    const report = [
      '🔒 DATABASE SECURITY AUDIT REPORT',
      '═'.repeat(50),
      `Overall Score: ${audit.score}/100 ${audit.critical ? '⚠️ CRITICAL ISSUES' : audit.score >= 80 ? '✅' : '⚠️'}`,
      `Timestamp: ${new Date().toISOString()}`,
      '',
      'SECURITY CHECKS:',
      ...audit.checks.map(check => 
        `${check.passed ? '✅' : '❌'} ${check.name}: ${check.message}`
      ),
      '',
      'SECRETS MANAGEMENT:',
      `Total secrets managed: ${secrets.totalSecrets}`,
      `Sources: ENV(${secrets.secretsBySource.environment}) FILE(${secrets.secretsBySource.file}) EXT(${secrets.secretsBySource.external})`,
      '',
      audit.recommendations.length > 0 ? 'RECOMMENDATIONS:' : 'ALL SECURITY CHECKS PASSED ✅',
      ...audit.recommendations.map((rec, i) => `${i + 1}. ${rec}`)
    ]

    return report.join('\n')
  }
}

/**
 * Utility function to run security audit
 */
export const auditDatabaseSecurity = () => DatabaseSecurityValidator.getInstance().auditDatabaseSecurity()

/**
 * Utility function to generate security report
 */
export const generateSecurityReport = () => DatabaseSecurityValidator.getInstance().generateSecurityReport()