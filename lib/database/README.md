# Database Abstraction Layer

This package provides a unified interface for working with multiple database types in the Industrial MCP application.

## Features

- **Multi-database support**: MySQL, Neo4j, PostgreSQL, SQLite
- **Connection management**: Automatic connection pooling and retry logic
- **Transaction support**: Database-agnostic transaction handling
- **Type safety**: Full TypeScript support with proper typing
- **Repository pattern**: Clean separation of data access logic
- **Health monitoring**: Built-in connection health checks

## Quick Start

```typescript
import { DatabaseManager, EquipmentRepository } from '@/lib/database'

// Initialize database manager from environment variables
const dbManager = DatabaseManager.fromEnvironment()
await dbManager.initialize()

// Get default connection
const connection = dbManager.getConnection()

// Or get specific connection
const neo4jConnection = dbManager.getConnection('neo4j')
const mysqlConnection = dbManager.getConnection('mysql')

// Use repositories for high-level operations
const equipmentRepo = new EquipmentRepository(connection)
const equipment = await equipmentRepo.getAll({ status: 'operational' })

// Direct queries
const result = await connection.query('MATCH (n) RETURN count(n) as total')
console.log('Total nodes:', result.data?.[0]?.total)
```

## Configuration

Set environment variables to configure connections:

### Neo4j
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_MAX_CONNECTIONS=50
NEO4J_TIMEOUT=60000
```

### MySQL
```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=industrial_mcp
MYSQL_USERNAME=root
MYSQL_PASSWORD=password
MYSQL_SSL=false
MYSQL_MAX_CONNECTIONS=10
MYSQL_TIMEOUT=60000
```

### Cloud SQL (Google Cloud)
```bash
CLOUD_SQL_CONNECTION_NAME=project:region:instance
CLOUD_SQL_DATABASE=industrial_mcp
CLOUD_SQL_USERNAME=root
CLOUD_SQL_PASSWORD=password
CLOUD_SQL_MAX_CONNECTIONS=5
```

### Default Database
```bash
DEFAULT_DATABASE=neo4j  # or mysql, cloudsql
```

## Architecture

### Core Components

- **`types.ts`**: TypeScript interfaces and type definitions
- **`base.ts`**: Abstract base class with common functionality
- **`manager.ts`**: Central database connection manager
- **Connection implementations**: `neo4j-connection.ts`, `mysql-connection.ts`
- **Repositories**: High-level data access patterns

### Database Connection Interface

```typescript
interface DatabaseConnection {
  readonly type: DatabaseType
  readonly isConnected: boolean
  
  connect(): Promise<void>
  disconnect(): Promise<void>
  query<T>(query: string, params?: any[]): Promise<QueryResult<T>>
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  ping(): Promise<boolean>
}
```

### Query Results

```typescript
interface QueryResult<T = any> {
  success: boolean
  data?: T[]
  error?: string
  affected?: number
  insertId?: string | number
  metadata?: Record<string, any>
}
```

## Usage Examples

### Basic Queries

```typescript
// Neo4j Cypher query
const neo4jResult = await neo4jConnection.query(
  'MATCH (e:Equipment {status: $status}) RETURN e',
  ['operational']
)

// MySQL query
const mysqlResult = await mysqlConnection.query(
  'SELECT * FROM equipment WHERE status = ?',
  ['operational']
)
```

### Transactions

```typescript
await dbManager.transaction(async (connection) => {
  await connection.query('CREATE (e:Equipment {id: "EQ001"})')
  await connection.query('CREATE (e:Equipment {id: "EQ002"})')
  // Both operations committed together
}, 'neo4j')
```

### Repository Pattern

```typescript
const equipmentRepo = new EquipmentRepository(connection)

// Create equipment
const newEquipment = await equipmentRepo.create({
  id: 'EQ001',
  name: 'Pump 1',
  type: 'pump',
  location: 'Building A',
  status: 'operational'
})

// Get equipment with filters
const pumps = await equipmentRepo.getAll({
  type: 'pump',
  status: 'operational',
  limit: 10
})

// Update equipment
await equipmentRepo.update('EQ001', {
  status: 'maintenance',
  lastMaintenenance: new Date()
})
```

### Health Monitoring

```typescript
// Check single connection
const isHealthy = await dbManager.isConnectionHealthy('neo4j')

// Check all connections
const healthStatus = await dbManager.getHealthStatus()
console.log(healthStatus)
// {
//   neo4j: { healthy: true, type: 'neo4j' },
//   mysql: { healthy: false, type: 'mysql', error: 'Connection timeout' }
// }
```

## Migration from Legacy Code

If you have existing code using the legacy `lib/neo4j.ts` driver:

```typescript
// Old way
import driver from '@/lib/neo4j'
const session = driver.session()
const result = await session.run('MATCH (n) RETURN n')

// New way
import { getGlobalDatabaseManager } from '@/lib/database'
const dbManager = await getGlobalDatabaseManager()
const connection = dbManager.getConnection('neo4j')
const result = await connection.query('MATCH (n) RETURN n')
```

## Industrial Data Models

The abstraction layer includes predefined models for industrial applications:

- **Equipment**: Physical assets and machinery
- **OperationalData**: Real-time sensor data and metrics
- **MaintenanceRecord**: Maintenance scheduling and history

## Best Practices

1. **Use repositories** for complex business logic
2. **Use transactions** for multi-step operations
3. **Handle errors gracefully** - all operations return success/error status
4. **Monitor connection health** in production
5. **Use connection pooling** for better performance
6. **Close connections** properly on application shutdown

## Error Handling

```typescript
const result = await connection.query('INVALID QUERY')
if (!result.success) {
  console.error('Query failed:', result.error)
  // Handle error appropriately
}
```

## Performance Considerations

- **Connection pooling**: Configured per database type
- **Query optimization**: Database-specific optimizations
- **Caching**: Repository-level caching can be added
- **Monitoring**: Built-in latency and health tracking