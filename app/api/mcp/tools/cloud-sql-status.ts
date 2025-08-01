/**
 * Cloud SQL Status MCP Tool
 * Provides readonly access to Cloud SQL database status and health information
 */

import { getGlobalDatabaseManager } from '@/lib/database'

export interface CloudSQLStatusParams {
  database?: string
  include_details?: boolean
}

export async function getCloudSQLStatus(params: CloudSQLStatusParams = {}) {
  try {
    const dbManager = await getGlobalDatabaseManager()
    const { database, include_details = false } = params
    
    // Get all connections or specific database
    const connectionNames = dbManager.getConnectionNames()
    const cloudSQLConnections = connectionNames.filter(name => 
      name.includes('prod') || name.includes('staging') || name.includes('cloudsql')
    )
    
    if (cloudSQLConnections.length === 0) {
      return {
        status: 'not_configured',
        message: 'No Cloud SQL connections configured',
        available_connections: connectionNames,
        timestamp: new Date().toISOString()
      }
    }
    
    // Filter to specific database if requested
    const connectionsToCheck = database 
      ? cloudSQLConnections.filter(name => name === database)
      : cloudSQLConnections
      
    if (database && connectionsToCheck.length === 0) {
      return {
        status: 'not_found',
        message: `Database '${database}' not found`,
        available_databases: cloudSQLConnections,
        timestamp: new Date().toISOString()
      }
    }
    
    // Check health status
    const healthStatus = await dbManager.getHealthStatus()
    const results: any = {
      status: 'success',
      total_databases: connectionsToCheck.length,
      healthy_databases: 0,
      databases: {},
      timestamp: new Date().toISOString()
    }
    
    // Test each database
    for (const connectionName of connectionsToCheck) {
      const connectionHealth = healthStatus[connectionName]
      const isHealthy = connectionHealth?.healthy || false
      
      if (isHealthy) {
        results.healthy_databases++
      }
      
      results.databases[connectionName] = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        type: connectionHealth?.type || 'unknown',
        error: connectionHealth?.error || null
      }
      
      // Add detailed information if requested
      if (include_details && isHealthy) {
        try {
          const connection = dbManager.getConnection(connectionName)
          
          // Get basic connection info
          const connectionInfo = await connection.query(`
            SELECT 
              CONNECTION_ID() as connection_id,
              USER() as current_user,
              DATABASE() as current_database,
              VERSION() as mysql_version,
              @@ssl_cipher as ssl_cipher,
              NOW() as server_time
          `)
          
          if (connectionInfo.success && connectionInfo.data?.[0]) {
            const info = connectionInfo.data[0]
            results.databases[connectionName].details = {
              connection_id: info.connection_id,
              current_user: info.current_user,
              current_database: info.current_database, 
              mysql_version: info.mysql_version,
              ssl_cipher: info.ssl_cipher,
              server_time: info.server_time,
              ssl_enabled: !!info.ssl_cipher
            }
          }
          
          // Get table count
          const tableCount = await connection.query(`
            SELECT COUNT(*) as table_count 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE()
          `)
          
          if (tableCount.success && tableCount.data?.[0]) {
            results.databases[connectionName].details.table_count = tableCount.data[0].table_count
          }
          
        } catch (error) {
          results.databases[connectionName].details_error = error instanceof Error ? error.message : String(error)
        }
      }
    }
    
    // Overall status
    results.overall_status = results.healthy_databases === results.total_databases ? 'all_healthy' : 
                           results.healthy_databases > 0 ? 'partially_healthy' : 'all_unhealthy'
    
    return results
    
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }
  }
}

export async function getCloudSQLSystemInfo() {
  try {
    const dbManager = await getGlobalDatabaseManager()
    const connectionNames = dbManager.getConnectionNames()
    
    // Get environment info
    const envInfo = {
      node_env: process.env.NODE_ENV,
      has_cloud_sql_host: !!process.env.CLOUD_SQL_HOST,
      has_cloud_sql_password: !!process.env.CLOUD_SQL_PASSWORD,
      has_ssl_certs: !!(process.env.CLOUD_SQL_CA_CERT && process.env.CLOUD_SQL_CLIENT_CERT),
      default_database: process.env.DEFAULT_DATABASE
    }
    
    // Database configuration overview
    const cloudSQLConnections = connectionNames.filter(name => 
      name.includes('prod') || name.includes('staging') || name.includes('cloudsql')
    )
    
    const result = {
      status: 'success',
      system_info: {
        total_connections: connectionNames.length,
        cloud_sql_connections: cloudSQLConnections.length,
        available_connections: connectionNames,
        cloud_sql_databases: cloudSQLConnections,
        environment: envInfo
      },
      mcp_readonly_access: {
        description: 'This MCP server provides readonly access to Cloud SQL databases',
        supported_operations: [
          'Database health monitoring',
          'Connection status checks', 
          'Table and schema information',
          'System status queries',
          'Performance metrics (readonly)'
        ],
        security_features: [
          'SSL/TLS encryption',
          'Client certificate authentication',
          'Readonly access only',
          'Connection pooling',
          'Authorized network restrictions'
        ]
      },
      timestamp: new Date().toISOString()
    }
    
    return result
    
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }
  }
}