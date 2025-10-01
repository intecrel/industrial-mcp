import { NextRequest, NextResponse } from 'next/server'

/**
 * Audit Tables Migration API Endpoint
 *
 * This endpoint can be called during deployment to ensure audit tables are created.
 * Protected by API key authentication.
 */

export async function POST(request: NextRequest) {
  try {
    // Import the migration function dynamically to avoid build-time bundling issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runMigration } = require('../../../../scripts/migrate-audit-tables.js')

    // Verify API key
    const apiKey = request.headers.get('x-api-key')
    const expectedApiKey = process.env.API_KEY

    if (!apiKey || !expectedApiKey || apiKey !== expectedApiKey) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing API key' },
        { status: 401 }
      )
    }

    console.log('🚀 Starting audit migration via API endpoint...')

    // Run the migration
    await runMigration()

    return NextResponse.json({
      success: true,
      message: 'Audit tables migration completed successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Migration API endpoint error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Migration failed',
        message: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key')
    const expectedApiKey = process.env.API_KEY

    if (!apiKey || !expectedApiKey || apiKey !== expectedApiKey) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing API key' },
        { status: 401 }
      )
    }

    // Check migration status (table existence)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require('mysql2/promise')

    // Environment-aware database selection
    const isLocal = process.env.NODE_ENV !== 'production' && !process.env.VERCEL_ENV
    const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

    let config: any

    // Priority 1: Local MySQL
    if (isLocal && process.env.MYSQL_HOST) {
      config = {
        host: process.env.MYSQL_HOST,
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USERNAME || 'root',
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        connectTimeout: 30000
      }
    }
    // Priority 2: Cloud SQL Connector (Vercel/Serverless)
    else if (process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME) {
      const database = isProduction
        ? (process.env.CLOUD_SQL_DB_PRIMARY || process.env.CLOUD_SQL_DB_STAGING)
        : (process.env.CLOUD_SQL_DB_STAGING || process.env.CLOUD_SQL_DB_PRIMARY)

      config = {
        instanceConnectionName: process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
        user: process.env.CLOUD_SQL_USERNAME || 'mcp_user',
        password: process.env.CLOUD_SQL_PASSWORD,
        database: database,
        useConnector: true
      }
    }
    // Priority 3: Cloud SQL Direct (with host)
    else if (process.env.CLOUD_SQL_HOST) {
      const database = isProduction
        ? (process.env.CLOUD_SQL_DB_PRIMARY || process.env.CLOUD_SQL_DB_STAGING)
        : (process.env.CLOUD_SQL_DB_STAGING || process.env.CLOUD_SQL_DB_PRIMARY)

      config = {
        host: process.env.CLOUD_SQL_HOST,
        port: parseInt(process.env.CLOUD_SQL_PORT || '3306'),
        user: process.env.CLOUD_SQL_USERNAME || 'mcp_user',
        password: process.env.CLOUD_SQL_PASSWORD,
        database: database,
        connectTimeout: 30000
      }
    }

    if (!config.password || !config.database) {
      return NextResponse.json(
        {
          success: false,
          error: 'Configuration error',
          message: 'Missing required database configuration. Local: MYSQL_HOST/PASSWORD/DATABASE, Cloud: CLOUD_SQL_INSTANCE_CONNECTION_NAME or CLOUD_SQL_HOST, plus CLOUD_SQL_PASSWORD and CLOUD_SQL_DB_PRIMARY or CLOUD_SQL_DB_STAGING',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }

    let connection

    // Use Cloud SQL Connector for serverless environments
    if (config.useConnector) {
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

      // Check if GOOGLE_APPLICATION_CREDENTIALS is inline JSON or file path
      const googleCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS
      if (googleCreds && googleCreds.trim().startsWith('{')) {
        // Inline JSON credentials - write to temp file
        try {
          const credentials = JSON.parse(googleCreds)

          // Write to temporary file
          const tempPath = path.join(tmpdir(), `gcp-credentials-${Date.now()}.json`)
          writeFileSync(tempPath, googleCreds)
          tempCredentialsFile = tempPath
          process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath
        } catch (error: any) {
          console.warn(`Failed to parse inline credentials: ${error.message}`)
        }
      }

      try {
        const connector = new Connector()
        const clientOpts = await connector.getOptions({
          instanceConnectionName: config.instanceConnectionName
        })

        connection = await mysql.createConnection({
          ...clientOpts,
          user: config.user,
          password: config.password,
          database: config.database
        })
      } finally {
        // Restore original credentials environment variable
        if (originalGoogleCredentials) {
          process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGoogleCredentials
        } else {
          delete process.env.GOOGLE_APPLICATION_CREDENTIALS
        }

        // Clean up temp file if created
        if (tempCredentialsFile) {
          try {
            unlinkSync(tempCredentialsFile)
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }
    } else {
      // Direct connection
      connection = await mysql.createConnection(config)
    }

    try {
      const [rows] = await connection.execute(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ? AND table_name LIKE '%audit%'
        ORDER BY table_name
      `, [config.database])

      const existingTables = rows.map((row: any) => row.table_name || row.TABLE_NAME)
      const expectedTables = ['audit_events', 'database_audit_events', 'audit_retention_policy']
      const missingTables = expectedTables.filter(table => !existingTables.includes(table))

      await connection.end()

      return NextResponse.json({
        success: true,
        migration_status: {
          existing_tables: existingTables,
          expected_tables: expectedTables,
          missing_tables: missingTables,
          is_complete: missingTables.length === 0
        },
        timestamp: new Date().toISOString()
      })

    } finally {
      await connection.end()
    }

  } catch (error: any) {
    console.error('❌ Migration status check error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check migration status',
        message: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}