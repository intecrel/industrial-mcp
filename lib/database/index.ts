/**
 * Database abstraction layer - Main exports
 */

// Core types and interfaces
export * from './types'

// Base classes
export { BaseDatabaseConnection } from './base'

// Database connections
export { Neo4jConnection } from './neo4j-connection'
export { MySQLConnection } from './mysql-connection'

// Database manager
export { DatabaseManager, type DatabaseManagerConfig } from './manager'

// Repositories
export { EquipmentRepository } from './repositories/equipment-repository'

// Import DatabaseManager for utility functions
import { DatabaseManager } from './manager'

// Utility function to create and initialize database manager
export async function createDatabaseManager(): Promise<DatabaseManager> {
  const manager = DatabaseManager.fromEnvironment()
  await manager.initialize()
  return manager
}

// Global database manager instance (lazy-loaded)
let globalManager: DatabaseManager | null = null

export async function getGlobalDatabaseManager(): Promise<DatabaseManager> {
  if (!globalManager) {
    globalManager = await createDatabaseManager()
  }
  return globalManager
}

export async function shutdownGlobalDatabaseManager(): Promise<void> {
  if (globalManager) {
    await globalManager.shutdown()
    globalManager = null
  }
}