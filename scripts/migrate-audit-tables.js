#!/usr/bin/env node
/**
 * Audit Tables Migration Script
 *
 * This script creates audit tables during deployment to overcome
 * permission and timing issues in the main application flow.
 */

const mysql = require('mysql2/promise');

// Migration configuration
const MIGRATION_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 5000,
  connectionTimeout: 60000,
  queryTimeout: 120000
};

// Audit table schema
const AUDIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  timestamp DATETIME(6) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  user_id VARCHAR(255),
  user_email VARCHAR(255),
  client_id VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(100),
  resource VARCHAR(255),
  action TEXT NOT NULL,
  result ENUM('success', 'failure', 'warning') NOT NULL,
  risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp),
  INDEX idx_event_type (event_type),
  INDEX idx_user_id (user_id),
  INDEX idx_user_email (user_email),
  INDEX idx_session_id (session_id),
  INDEX idx_risk_level (risk_level),
  INDEX idx_result (result),
  INDEX idx_created_at (created_at),
  INDEX idx_composite_user_time (user_id, timestamp),
  INDEX idx_composite_type_time (event_type, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS database_audit_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  audit_event_id BIGINT NOT NULL,
  database_type ENUM('neo4j', 'mysql') NOT NULL,
  operation_type ENUM('CREATE', 'MERGE', 'SET', 'READ') NOT NULL,
  query_hash VARCHAR(64) NOT NULL,
  affected_nodes INT DEFAULT 0,
  affected_relationships INT DEFAULT 0,
  execution_time_ms INT NOT NULL,
  complexity_score INT DEFAULT 0,
  transaction_id VARCHAR(100),
  query_parameters JSON,
  before_state JSON,
  after_state JSON,
  state_size_bytes INT DEFAULT 0,
  compressed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_event_id (audit_event_id),
  INDEX idx_database_type (database_type),
  INDEX idx_operation_type (operation_type),
  INDEX idx_query_hash (query_hash),
  INDEX idx_transaction_id (transaction_id),
  INDEX idx_execution_time (execution_time_ms),
  INDEX idx_complexity (complexity_score),
  INDEX idx_composite_db_op (database_type, operation_type),
  INDEX idx_composite_db_time (database_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_retention_policy (
  id INT PRIMARY KEY AUTO_INCREMENT,
  event_type VARCHAR(100) NOT NULL,
  retention_days INT NOT NULL,
  archive_after_days INT,
  delete_after_days INT,
  compress_after_days INT DEFAULT 90,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO audit_retention_policy (event_type, retention_days, archive_after_days, delete_after_days, compress_after_days) VALUES
  ('database.neo4j.%', 2555, 365, 2555, 90),
  ('security.%', 2190, 365, 2190, 30),
  ('oauth.%', 1095, 180, 1095, 60),
  ('auth.%', 730, 90, 730, 30),
  ('system.%', 365, 90, 365, 30),
  ('default', 365, 90, 365, 30);
`;

/**
 * Get database configuration from environment
 */
function getDatabaseConfig() {
  // Check if we're in local development mode
  const isLocal = process.env.NODE_ENV !== 'production' && !process.env.VERCEL_ENV;

  let config;

  if (isLocal && process.env.MYSQL_HOST) {
    // Use local MySQL configuration
    config = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USERNAME || 'root',
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'seoptinalytics-agency',
      connectTimeout: MIGRATION_CONFIG.connectionTimeout,
      acquireTimeout: MIGRATION_CONFIG.connectionTimeout,
      timeout: MIGRATION_CONFIG.queryTimeout,
      charset: 'utf8mb4'
    };

    if (!config.password) {
      throw new Error('MYSQL_PASSWORD environment variable is required for local development');
    }
  } else {
    // Use Cloud SQL configuration
    config = {
      host: process.env.CLOUD_SQL_HOST || '34.69.40.212',
      port: parseInt(process.env.CLOUD_SQL_PORT || '3306'),
      user: process.env.CLOUD_SQL_USERNAME || 'mcp-reader',
      password: process.env.CLOUD_SQL_PASSWORD,
      database: process.env.CLOUD_SQL_DATABASE_NAME || 'seoptinalytics-staging',
      connectTimeout: MIGRATION_CONFIG.connectionTimeout,
      acquireTimeout: MIGRATION_CONFIG.connectionTimeout,
      timeout: MIGRATION_CONFIG.queryTimeout,
      charset: 'utf8mb4'
    };

    if (!config.password) {
      throw new Error('CLOUD_SQL_PASSWORD environment variable is required');
    }
  }

  return config;
}

/**
 * Create database connection with retry logic
 */
async function createConnection() {
  const config = getDatabaseConfig();

  for (let attempt = 1; attempt <= MIGRATION_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔗 Attempting database connection (attempt ${attempt}/${MIGRATION_CONFIG.maxRetries})...`);

      const connection = await mysql.createConnection(config);

      // Test connection
      await connection.execute('SELECT 1');
      console.log(`✅ Connected to MySQL database: ${config.host}:${config.port}/${config.database}`);

      return connection;
    } catch (error) {
      console.error(`❌ Connection attempt ${attempt} failed:`, error.message);

      if (attempt === MIGRATION_CONFIG.maxRetries) {
        throw new Error(`Failed to connect after ${MIGRATION_CONFIG.maxRetries} attempts: ${error.message}`);
      }

      console.log(`⏳ Waiting ${MIGRATION_CONFIG.retryDelayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, MIGRATION_CONFIG.retryDelayMs));
    }
  }
}

/**
 * Check if tables already exist
 */
async function checkExistingTables(connection) {
  const config = getDatabaseConfig();
  const [rows] = await connection.execute(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ? AND table_name LIKE '%audit%'
    ORDER BY table_name
  `, [config.database]);

  const existingTables = rows.map(row => row.TABLE_NAME || row.table_name);
  const expectedTables = ['audit_events', 'database_audit_events', 'audit_retention_policy'];
  console.log(`📋 Checking audit tables status:`);
  expectedTables.forEach(table => {
    const exists = existingTables.includes(table);
    console.log(`   ${exists ? '✅' : '❌'} ${table}: ${exists ? 'EXISTS' : 'MISSING'}`);
  });

  const missingTables = expectedTables.filter(table => !existingTables.includes(table));
  console.log(`📊 Summary: ${expectedTables.length - missingTables.length}/${expectedTables.length} tables exist, ${missingTables.length} missing`);

  return { existingTables, expectedTables, missingTables };
}

/**
 * Execute migration statements
 */
async function executeMigration(connection, missingTables) {
  const statements = AUDIT_SCHEMA_SQL
    .split(/;\s*\n/)
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  console.log(`📝 Executing ${statements.length} migration statements for ${missingTables.length} missing tables...`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement) continue;

    try {
      console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`);
      const startTime = Date.now();

      await connection.execute(statement);

      const executionTime = Date.now() - startTime;

      // Check if this statement created a table
      const createdTable = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (createdTable) {
        const tableName = createdTable[1];
        console.log(`✅ Statement ${i + 1} completed (${executionTime}ms) - Table ${tableName} ready`);
      } else {
        console.log(`✅ Statement ${i + 1} completed (${executionTime}ms)`);
      }

    } catch (error) {
      console.error(`❌ Statement ${i + 1} failed:`, error.message);
      console.error(`📝 Failed statement:\n${statement}`);
      throw error;
    }
  }
}

/**
 * Verify migration success
 */
async function verifyMigration(connection) {
  console.log('🔍 Verifying migration results...');

  const { existingTables, expectedTables, missingTables } = await checkExistingTables(connection);

  if (missingTables.length > 0) {
    throw new Error(`Migration verification failed. Missing tables: ${missingTables.join(', ')}`);
  }

  // Check retention policy data
  const [policyRows] = await connection.execute('SELECT COUNT(*) as count FROM audit_retention_policy');
  const policyCount = policyRows[0].count;

  console.log(`✅ Migration verified successfully:`);
  console.log(`   - All ${expectedTables.length} tables exist`);
  console.log(`   - Found ${policyCount} retention policies`);
}

/**
 * Main migration function
 */
async function runMigration() {
  let connection;

  try {
    console.log('🚀 Starting audit tables migration...');
    console.log(`📊 Config: ${MIGRATION_CONFIG.maxRetries} retries, ${MIGRATION_CONFIG.queryTimeout}ms timeout`);

    // Create connection
    connection = await createConnection();

    // Check existing state
    const { existingTables, expectedTables, missingTables } = await checkExistingTables(connection);

    if (missingTables.length === 0) {
      console.log('✅ All audit tables already exist, skipping migration');
      console.log('🎉 No migration needed - all tables are ready!');
      return;
    }

    console.log(`🔨 Need to create ${missingTables.length} missing tables: ${missingTables.join(', ')}`);

    // Execute migration
    await executeMigration(connection, missingTables);

    // Verify results
    await verifyMigration(connection);

    console.log('🎉 Audit tables migration completed successfully!');

  } catch (error) {
    console.error('💥 Migration failed:', error.message);
    console.error('🔍 Full error:', error);
    process.exit(1);

  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration().catch(error => {
    console.error('🚨 Unhandled migration error:', error);
    process.exit(1);
  });
}

module.exports = { runMigration };