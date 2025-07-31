#!/usr/bin/env node
/**
 * Cloud SQL MySQL Connection Test Script
 * =====================================
 * Tests connectivity to Google Cloud SQL MySQL databases with SSL certificates
 * 
 * Usage:
 *   node scripts/test-cloud-sql.js
 *   node scripts/test-cloud-sql.js --database=industrial_prod --verbose
 */

const { DatabaseManager } = require('../lib/database/manager.js')
const { getConnectionTestQuery, getSecurityCheckQuery } = require('../lib/database/cloud-sql-config.js')

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
}

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=')
  const cleanKey = key.replace(/^--/, '')
  acc[cleanKey] = value || true
  return acc
}, {})

const verbose = args.verbose || false
const targetDatabase = args.database || null

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title) {
  const border = '━'.repeat(title.length + 4)
  log(`${colors.bright}${colors.cyan}${border}`, 'cyan')
  log(`${colors.bright}${colors.cyan}┃ ${title.toUpperCase()} ┃`, 'cyan')
  log(`${colors.bright}${colors.cyan}${border}`, 'cyan')
}

async function testDatabaseConnection(manager, connectionName) {
  logSection(`Testing ${connectionName}`)
  
  try {
    // Check if connection exists
    const connectionNames = manager.getConnectionNames()
    if (!connectionNames.includes(connectionName)) {
      log(`❌ Connection '${connectionName}' not configured`, 'red')
      return false
    }

    // Get connection
    const connection = manager.getConnection(connectionName)
    log(`✅ Connection '${connectionName}' retrieved (${connection.type})`, 'green')

    // Test basic connectivity
    log('🔍 Testing basic connectivity...', 'yellow')
    const pingResult = await connection.ping()
    if (!pingResult) {
      log('❌ Ping test failed', 'red')
      return false
    }
    log('✅ Ping test successful', 'green')

    // Test connection info query
    log('🔍 Testing connection info query...', 'yellow')
    const connectionTest = await connection.query(getConnectionTestQuery())
    if (!connectionTest.success) {
      log(`❌ Connection test query failed: ${connectionTest.error}`, 'red')
      return false
    }
    
    log('✅ Connection test query successful', 'green')
    if (verbose && connectionTest.data?.[0]) {
      const info = connectionTest.data[0]
      log(`   Connection ID: ${info.connection_id}`, 'blue')
      log(`   Current User: ${info.current_user}`, 'blue')
      log(`   Database: ${info.current_database}`, 'blue')
      log(`   MySQL Version: ${info.mysql_version}`, 'blue')
      log(`   SSL Cipher: ${info.ssl_cipher || 'None'}`, 'blue')
      log(`   Server Time: ${info.server_time}`, 'blue')
    }

    // Test SSL security check
    log('🔍 Testing SSL security configuration...', 'yellow')
    const securityCheck = await connection.query(getSecurityCheckQuery())
    if (!securityCheck.success) {
      log(`⚠️ SSL security check failed: ${securityCheck.error}`, 'yellow')
    } else {
      log('✅ SSL security check successful', 'green')
      if (verbose && securityCheck.data) {
        securityCheck.data.forEach(row => {
          log(`   ${row.VARIABLE_NAME}: ${row.VARIABLE_VALUE || 'Not set'}`, 'blue')
        })
      }
    }

    // Test sample queries for readonly MCP access
    log('🔍 Testing sample readonly queries...', 'yellow')
    
    // Test SHOW TABLES (should work for readonly access)
    const tablesResult = await connection.query('SHOW TABLES')
    if (tablesResult.success) {
      log(`✅ SHOW TABLES successful (${tablesResult.data?.length || 0} tables)`, 'green')
      if (verbose && tablesResult.data) {
        tablesResult.data.slice(0, 5).forEach(table => {
          const tableName = Object.values(table)[0]
          log(`   Table: ${tableName}`, 'blue')
        })
        if (tablesResult.data.length > 5) {
          log(`   ... and ${tablesResult.data.length - 5} more tables`, 'blue')
        }
      }
    } else {
      log(`❌ SHOW TABLES failed: ${tablesResult.error}`, 'red')
    }

    // Test database-specific queries based on connection name
    if (connectionName.includes('industrial')) {
      log('🔍 Testing industrial equipment queries...', 'yellow')
      const equipmentResult = await connection.query(`
        SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME LIKE '%equipment%'
        LIMIT 5
      `)
      if (equipmentResult.success) {
        log(`✅ Equipment table query successful`, 'green')
        if (verbose && equipmentResult.data?.length) {
          equipmentResult.data.forEach(row => {
            log(`   ${row.TABLE_NAME}: ${row.TABLE_ROWS} rows (${Math.round(row.DATA_LENGTH/1024)}KB)`, 'blue')
          })
        }
      }
    }

    return true

  } catch (error) {
    log(`❌ Connection test failed: ${error.message}`, 'red')
    if (verbose) {
      log(`   Stack: ${error.stack}`, 'red')
    }
    return false
  }
}

async function testHealthMonitoring(manager) {
  logSection('Database Health Monitoring')
  
  try {
    const healthStatus = await manager.getHealthStatus()
    
    log('📊 Health Status Summary:', 'yellow')
    let healthyCount = 0
    let totalCount = 0
    
    for (const [name, status] of Object.entries(healthStatus)) {
      totalCount++
      if (status.healthy) {
        healthyCount++
        log(`✅ ${name}: Healthy (${status.type})`, 'green')
      } else {
        log(`❌ ${name}: Unhealthy (${status.type}) - ${status.error}`, 'red')
      }
    }
    
    log(`📈 Overall Health: ${healthyCount}/${totalCount} connections healthy`, 
         healthyCount === totalCount ? 'green' : 'yellow')
    
    return healthyCount > 0
    
  } catch (error) {
    log(`❌ Health monitoring failed: ${error.message}`, 'red')
    return false
  }
}

async function testMCPReadonlyAccess(manager) {
  logSection('MCP Readonly Access Test')
  
  try {
    // Test typical MCP queries that would be used by readonly tools
    const connections = manager.getConnectionNames().filter(name => 
      name.includes('industrial') || name.includes('operational')
    )
    
    if (connections.length === 0) {
      log('⚠️ No industrial/operational databases configured for MCP testing', 'yellow')
      return true
    }
    
    let successCount = 0
    
    for (const connectionName of connections.slice(0, 2)) { // Test max 2 connections
      log(`🔍 Testing MCP readonly access on ${connectionName}...`, 'yellow')
      
      try {
        const connection = manager.getConnection(connectionName)
        
        // Simulate MCP tool queries
        const mcpQueries = [
          {
            name: 'Database Info',
            query: 'SELECT DATABASE() as db_name, USER() as user_name, VERSION() as version'
          },
          {
            name: 'Table Count',
            query: `SELECT COUNT(*) as table_count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
          },
          {
            name: 'System Status', 
            query: `SELECT 'operational' as status, NOW() as timestamp, 'Cloud SQL MySQL' as system_type`
          }
        ]
        
        for (const query of mcpQueries) {
          const result = await connection.query(query.query)
          if (result.success) {
            log(`  ✅ ${query.name}: Success`, 'green')
            if (verbose && result.data?.[0]) {
              const data = result.data[0]
              Object.entries(data).forEach(([key, value]) => {
                log(`     ${key}: ${value}`, 'blue')
              })
            }
          } else {
            log(`  ❌ ${query.name}: Failed - ${result.error}`, 'red')
          }
        }
        
        successCount++
        
      } catch (error) {
        log(`  ❌ MCP test failed for ${connectionName}: ${error.message}`, 'red')
      }
    }
    
    log(`📊 MCP Access Test: ${successCount}/${connections.length} connections tested successfully`, 
         successCount > 0 ? 'green' : 'red')
    
    return successCount > 0
    
  } catch (error) {
    log(`❌ MCP readonly access test failed: ${error.message}`, 'red')
    return false
  }
}

async function main() {
  logSection('Cloud SQL MySQL Connection Test')
  
  log(`🎯 Target Database: ${targetDatabase || 'All configured databases'}`, 'cyan')
  log(`📝 Verbose Mode: ${verbose ? 'Enabled' : 'Disabled'}`, 'cyan')
  log(`⏰ Test Time: ${new Date().toISOString()}`, 'cyan')
  
  let dbManager
  let overallSuccess = true
  
  try {
    // Initialize database manager
    log('🔧 Initializing database manager...', 'yellow')
    dbManager = DatabaseManager.fromEnvironment()
    await dbManager.initialize()
    log('✅ Database manager initialized', 'green')
    
    const connectionNames = dbManager.getConnectionNames()
    log(`📋 Available connections: ${connectionNames.join(', ')}`, 'blue')
    
    // Filter Cloud SQL connections
    const cloudSQLConnections = connectionNames.filter(name => 
      name.includes('prod') || name.includes('staging') || name.includes('cloudsql')
    )
    
    if (cloudSQLConnections.length === 0) {
      log('⚠️ No Cloud SQL connections found. Check your environment configuration.', 'yellow')
      log('💡 Required environment variables:', 'blue')
      log('   - CLOUD_SQL_HOST', 'blue')
      log('   - CLOUD_SQL_PASSWORD', 'blue')
      log('   - CLOUD_SQL_CA_CERT, CLOUD_SQL_CLIENT_CERT, CLOUD_SQL_CLIENT_KEY', 'blue')
      overallSuccess = false
    } else {
      log(`🎯 Testing ${cloudSQLConnections.length} Cloud SQL connections`, 'cyan')
      
      // Test specific database or all
      const connectionsToTest = targetDatabase 
        ? [targetDatabase].filter(name => cloudSQLConnections.includes(name))
        : cloudSQLConnections
      
      if (connectionsToTest.length === 0) {
        log(`❌ Target database '${targetDatabase}' not found in Cloud SQL connections`, 'red')
        overallSuccess = false
      } else {
        // Test each connection
        for (const connectionName of connectionsToTest) {
          const success = await testDatabaseConnection(dbManager, connectionName)
          if (!success) overallSuccess = false
          
          // Add spacing between tests
          if (connectionsToTest.length > 1) {
            console.log()
          }
        }
        
        // Test health monitoring
        const healthSuccess = await testHealthMonitoring(dbManager)
        if (!healthSuccess) overallSuccess = false
        
        // Test MCP readonly access
        const mcpSuccess = await testMCPReadonlyAccess(dbManager)
        if (!mcpSuccess) overallSuccess = false
      }
    }
    
  } catch (error) {
    log(`❌ Test initialization failed: ${error.message}`, 'red')
    if (verbose) {
      log(`Stack: ${error.stack}`, 'red')
    }
    overallSuccess = false
  } finally {
    // Cleanup
    if (dbManager) {
      try {
        await dbManager.shutdown()
        log('🔧 Database manager shutdown complete', 'blue')
      } catch (error) {
        log(`⚠️ Shutdown warning: ${error.message}`, 'yellow')
      }
    }
  }
  
  // Final results
  logSection('Test Results Summary')
  
  if (overallSuccess) {
    log('🎉 All Cloud SQL tests passed! Ready for Claude Desktop integration.', 'green')
    log('💡 Next steps:', 'blue')
    log('   1. Configure environment variables in Vercel', 'blue')
    log('   2. Test MCP endpoints via API calls', 'blue')  
    log('   3. Update Claude Desktop configuration', 'blue')
    process.exit(0)
  } else {
    log('❌ Some tests failed. Please check your configuration.', 'red')
    log('🔧 Troubleshooting tips:', 'yellow')
    log('   - Verify environment variables are set correctly', 'yellow')
    log('   - Check SSL certificates are accessible', 'yellow')
    log('   - Ensure authorized networks include your IP', 'yellow')
    log('   - Verify Cloud SQL instance is running', 'yellow')
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n🛑 Received interrupt signal. Shutting down gracefully...', 'yellow')
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  log(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`, 'red')
  process.exit(1)
})

// Run the test
main().catch(error => {
  log(`❌ Unexpected error: ${error.message}`, 'red')
  process.exit(1)
})