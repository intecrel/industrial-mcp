/**
 * Legacy Neo4j driver - DEPRECATED
 * Use lib/database/manager.ts and lib/database/neo4j-connection.ts instead
 * 
 * This file is kept for backward compatibility with existing code
 * that imports it directly. New code should use the database abstraction layer.
 */

import neo4j from 'neo4j-driver'
import { getGlobalDatabaseManager } from './database'

// Legacy driver for backward compatibility
const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
        process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
    )
)

// Export legacy driver as default
export default driver

// Export new database manager for migration
export { getGlobalDatabaseManager }