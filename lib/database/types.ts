/**
 * Database abstraction layer types and interfaces
 */

export type DatabaseType = 'mysql' | 'neo4j' | 'postgresql' | 'sqlite'

export interface DatabaseConfig {
  type: DatabaseType
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  uri?: string
  ssl?: boolean | {
    ca?: string
    cert?: string
    key?: string
    rejectUnauthorized?: boolean
  }
  maxConnections?: number
  timeout?: number
}

export interface QueryResult<T = any> {
  success: boolean
  data?: T[]
  error?: string
  affected?: number
  insertId?: string | number
  metadata?: Record<string, any>
}

export interface DatabaseConnection {
  readonly type: DatabaseType
  readonly isConnected: boolean
  
  connect(): Promise<void>
  disconnect(): Promise<void>
  
  // Raw query execution
  query<T = any>(query: string, params?: any[] | Record<string, any>): Promise<QueryResult<T>>
  
  // Transaction support
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  
  // Health check
  ping(): Promise<boolean>
  
  // Schema operations
  createTable?(schema: TableSchema): Promise<void>
  dropTable?(tableName: string): Promise<void>
}

export interface TableSchema {
  name: string
  columns: ColumnDefinition[]
  indexes?: IndexDefinition[]
  primaryKey?: string[]
  foreignKeys?: ForeignKeyDefinition[]
}

export interface ColumnDefinition {
  name: string
  type: string
  nullable?: boolean
  default?: any
  unique?: boolean
  autoIncrement?: boolean
}

export interface IndexDefinition {
  name: string
  columns: string[]
  unique?: boolean
}

export interface ForeignKeyDefinition {
  column: string
  referencedTable: string
  referencedColumn: string
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT'
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT'
}

// Database-specific query builders
export interface QueryBuilder {
  select(columns?: string[]): QueryBuilder
  from(table: string): QueryBuilder
  where(condition: string, value?: any): QueryBuilder
  join(table: string, condition: string): QueryBuilder
  orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder
  limit(count: number): QueryBuilder
  offset(count: number): QueryBuilder
  build(): { query: string; params: any[] }
}

// Industrial-specific data models
export interface Equipment {
  id: string
  name: string
  type: string
  location: string
  status: 'operational' | 'maintenance' | 'fault' | 'offline'
  lastMaintenenance?: Date
  nextMaintenance?: Date
  specifications?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export interface OperationalData {
  id: string
  equipmentId: string
  timestamp: Date
  metrics: Record<string, number>
  alarms?: string[]
  quality: 'good' | 'uncertain' | 'bad'
  source: string
}

export interface MaintenanceRecord {
  id: string
  equipmentId: string
  type: 'preventive' | 'corrective' | 'emergency'
  scheduledDate: Date
  completedDate?: Date
  technician?: string
  description: string
  parts?: string[]
  cost?: number
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled'
}