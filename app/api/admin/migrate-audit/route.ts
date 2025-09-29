import { NextRequest, NextResponse } from 'next/server'

/**
 * Audit Tables Migration API Endpoint
 *
 * This endpoint can be called during deployment to ensure audit tables are created.
 * Protected by API key authentication.
 */

// Import the migration function
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runMigration } = require('../../../../scripts/migrate-audit-tables.js')

export async function POST(request: NextRequest) {
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

    const config = {
      host: process.env.CLOUD_SQL_HOST || '34.69.40.212',
      port: parseInt(process.env.CLOUD_SQL_PORT || '3306'),
      user: process.env.CLOUD_SQL_USERNAME || 'mcp-reader',
      password: process.env.CLOUD_SQL_PASSWORD,
      database: process.env.CLOUD_SQL_DATABASE_NAME || 'seoptinalytics-staging',
      connectTimeout: 30000,
      acquireTimeout: 30000,
      timeout: 60000
    }

    const connection = await mysql.createConnection(config)

    try {
      const [rows] = await connection.execute(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ? AND table_name LIKE '%audit%'
        ORDER BY table_name
      `, [config.database])

      const existingTables = rows.map((row: any) => row.table_name)
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