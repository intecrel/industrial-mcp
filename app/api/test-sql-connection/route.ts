import { NextRequest, NextResponse } from 'next/server'

/**
 * Test SQL Connection and Table Creation
 *
 * This endpoint tests the exact connection approach used in audit-storage.ts
 * to diagnose why auto-creation might be failing.
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const logs: string[] = []

  function log(message: string) {
    const timestamp = new Date().toISOString()
    const msg = `[${timestamp}] ${message}`
    console.log(msg)
    logs.push(msg)
  }

  try {
    log('🧪 Starting SQL connection test...')

    // Import mysql2 dynamically
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require('mysql2/promise')
    log('✅ mysql2 imported')

    // Environment detection (same as audit-storage.ts)
    const isLocal = process.env.NODE_ENV !== 'production' && !process.env.VERCEL_ENV
    const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

    log(`📍 Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL_ENV=${process.env.VERCEL_ENV}`)
    log(`📍 Is Local: ${isLocal}, Is Production: ${isProduction}`)
    log(`📍 CLOUD_SQL_USERNAME env var: ${process.env.CLOUD_SQL_USERNAME || 'NOT SET'}`)

    let connection: any = null

    // Priority 1: Local MySQL
    if (isLocal && process.env.MYSQL_HOST) {
      log('📍 Using LOCAL MySQL configuration')
      connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USERNAME || 'root',
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        connectTimeout: 60000,
        charset: 'utf8mb4'
      })
      log('✅ Local MySQL connection created')
    }
    // Priority 2: Cloud SQL Connector
    else if (process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME) {
      log('📍 Using CLOUD SQL CONNECTOR configuration')

      const database = isProduction
        ? (process.env.CLOUD_SQL_DB_PRIMARY || process.env.CLOUD_SQL_DB_STAGING)
        : (process.env.CLOUD_SQL_DB_STAGING || process.env.CLOUD_SQL_DB_PRIMARY)

      log(`   Target Database: ${database}`)
      log(`   Instance: ${process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME}`)

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Connector } = require('@google-cloud/cloud-sql-connector')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writeFileSync, unlinkSync } = require('fs')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { tmpdir } = require('os')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path')

      let tempCredentialsFile: string | null = null
      const originalGoogleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS

      // Handle inline JSON credentials
      const googleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS
      if (googleCreds && googleCreds.trim().startsWith('{')) {
        log('📝 Writing inline credentials to temp file...')
        try {
          JSON.parse(googleCreds) // Validate JSON
          const tempPath = path.join(tmpdir(), `gcp-creds-test-${Date.now()}.json`)
          writeFileSync(tempPath, googleCreds)
          tempCredentialsFile = tempPath
          process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath
          log(`✅ Credentials written to ${tempPath}`)
        } catch (error: any) {
          log(`⚠️ Failed to parse inline credentials: ${error.message}`)
        }
      }

      try {
        log('🔌 Creating Cloud SQL Connector...')
        const connector = new Connector()

        log('🔌 Getting connection options...')
        const clientOpts = await connector.getOptions({
          instanceConnectionName: process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME
        })
        log('✅ Got connection options')

        const userName = process.env.CLOUD_SQL_USERNAME || 'mcp_user'
        const dbPassword = process.env.CLOUD_SQL_PASSWORD ? '***SET***' : '***NOT SET***'

        log(`🔌 Creating MySQL connection with user: ${userName}, password: ${dbPassword}...`)
        connection = await mysql.createConnection({
          ...clientOpts,
          user: userName,
          password: process.env.CLOUD_SQL_PASSWORD,
          database: database
        })
        log('✅ MySQL connection created via Cloud SQL Connector')

      } finally {
        // Restore credentials
        if (originalGoogleCredentials) {
          process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGoogleCredentials
        } else {
          delete process.env.GOOGLE_APPLICATION_CREDENTIALS
        }

        // Clean up temp file
        if (tempCredentialsFile) {
          try {
            unlinkSync(tempCredentialsFile)
            log('🗑️ Temp credentials file deleted')
          } catch (error) {
            log('⚠️ Failed to delete temp file (non-fatal)')
          }
        }
      }
    }
    // Priority 3: Cloud SQL Direct
    else if (process.env.CLOUD_SQL_HOST) {
      log('📍 Using CLOUD SQL DIRECT configuration')
      const database = isProduction
        ? (process.env.CLOUD_SQL_DB_PRIMARY || process.env.CLOUD_SQL_DB_STAGING)
        : (process.env.CLOUD_SQL_DB_STAGING || process.env.CLOUD_SQL_DB_PRIMARY)

      connection = await mysql.createConnection({
        host: process.env.CLOUD_SQL_HOST,
        port: parseInt(process.env.CLOUD_SQL_PORT || '3306'),
        user: process.env.CLOUD_SQL_USERNAME || 'mcp_user',
        password: process.env.CLOUD_SQL_PASSWORD,
        database: database,
        connectTimeout: 60000
      })
      log('✅ Cloud SQL Direct connection created')
    } else {
      throw new Error('No database configuration found')
    }

    if (!connection) {
      throw new Error('Failed to create connection')
    }

    // Test connection with ping
    log('🏓 Testing connection with ping...')
    await connection.ping()
    log('✅ Connection ping successful')

    // Test simple query
    log('📊 Running SELECT 1 test...')
    const [rows] = await connection.execute('SELECT 1 as test')
    log(`✅ Test query successful: ${JSON.stringify(rows)}`)

    // Create actual audit_events table (matching migration script)
    log(`📋 Creating audit_events table (same as migration script)...`)

    const createAuditEventsSQL = `
      CREATE TABLE IF NOT EXISTS audit_events (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        event_type VARCHAR(50) NOT NULL,
        user_id VARCHAR(255),
        resource_type VARCHAR(100),
        resource_id VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        details JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_resource (resource_type, resource_id),
        INDEX idx_created_at (created_at),
        INDEX idx_event_type (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `

    await connection.execute(createAuditEventsSQL)
    log(`✅ audit_events table created successfully`)

    // Insert test data
    log('📝 Inserting test audit event...')
    await connection.execute(
      `INSERT INTO audit_events (event_type, action, details) VALUES (?, ?, ?)`,
      ['test', 'test_connection', JSON.stringify({ test: true, timestamp: Date.now() })]
    )
    log('✅ Test audit event inserted')

    // Query test data
    log('📊 Querying audit_events...')
    const [testRows] = await connection.execute(`SELECT * FROM audit_events ORDER BY id DESC LIMIT 1`)
    log(`✅ Test data retrieved: ${JSON.stringify(testRows)}`)

    // Clean up test data (but keep table)
    log(`🗑️ Cleaning up test data...`)
    await connection.execute(`DELETE FROM audit_events WHERE event_type = 'test'`)
    log('✅ Test data cleaned up (table preserved)')

    // Close connection
    log('🔌 Closing connection...')
    await connection.end()
    log('✅ Connection closed')

    const duration = Date.now() - startTime
    log(`🎉 All tests passed in ${duration}ms`)

    return NextResponse.json({
      success: true,
      message: 'SQL connection and table creation test passed',
      duration_ms: duration,
      logs: logs
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    log(`❌ Test failed: ${error.message}`)
    log(`Stack: ${error.stack}`)

    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      duration_ms: duration,
      logs: logs
    }, { status: 500 })
  }
}
