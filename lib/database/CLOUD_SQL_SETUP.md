# Google Cloud SQL Configuration Guide

This guide covers setting up the Industrial MCP application with your Google Cloud SQL Enterprise HA instance.

## Your Cloud SQL Setup

- **Instance Type**: Enterprise with High Availability (HA)
- **Databases**: 5 databases (4 Production + 1 Staging)
- **Connectivity**: Public IP with Authorized Networks
- **Security**: SSL/TLS encryption with trusted client certificates
- **Authentication**: SSL-only connections required

## Environment Variables

### Required Configuration

```bash
# Cloud SQL Connection Details
CLOUD_SQL_HOST=YOUR_CLOUD_SQL_PUBLIC_IP
CLOUD_SQL_PORT=3306
CLOUD_SQL_USERNAME=industrial_mcp
CLOUD_SQL_PASSWORD=YOUR_SECURE_PASSWORD

# SSL Certificate Paths or Content
CLOUD_SQL_CA_CERT=./certs/server-ca.pem
CLOUD_SQL_CLIENT_CERT=./certs/client-cert.pem  
CLOUD_SQL_CLIENT_KEY=./certs/client-key.pem

# Database Names (customize as needed)
CLOUD_SQL_DB_INDUSTRIAL=industrial_mcp_prod
CLOUD_SQL_DB_OPERATIONAL=operational_data_prod
CLOUD_SQL_DB_MAINTENANCE=maintenance_records_prod
CLOUD_SQL_DB_ANALYTICS=analytics_data_prod
CLOUD_SQL_DB_STAGING=industrial_mcp_staging

# Connection Tuning
CLOUD_SQL_MAX_CONNECTIONS=5
CLOUD_SQL_TIMEOUT=30000

# Default Database Selection
DEFAULT_DATABASE=industrial_prod  # or industrial_staging for dev/test
```

### Alternative: Environment-based Certificate Content

Instead of file paths, you can provide certificate content directly:

```bash
CLOUD_SQL_CA_CERT="-----BEGIN CERTIFICATE-----
MIIDfzCCAmegAwIBAgIBADANBgkqhkiG9w0BAQsFADA...
-----END CERTIFICATE-----"

CLOUD_SQL_CLIENT_CERT="-----BEGIN CERTIFICATE-----
MIIDSTCCAjGgAwIBAgIBADANBgkqhkiG9w0BAQsFADA...
-----END CERTIFICATE-----"

CLOUD_SQL_CLIENT_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA4f6wg8OFnGdC8eQ5f3N1l8xJVfU...
-----END RSA PRIVATE KEY-----"
```

## Certificate Setup

### Option 1: File-based Certificates

1. Download your Cloud SQL certificates from Google Cloud Console
2. Place them in a `certs/` directory:
   ```
   certs/
   ├── server-ca.pem      # Cloud SQL CA certificate
   ├── client-cert.pem    # Client certificate
   └── client-key.pem     # Client private key
   ```

### Option 2: Environment Variables

Set the certificate content directly in environment variables (recommended for production):

```bash
# Get the certificates from Google Cloud Console or gcloud CLI
gcloud sql ssl-certs describe CERT_NAME --instance=INSTANCE_NAME --format="value(cert)"
```

## Database Schema Setup

The application will automatically create the required tables. The main schemas are:

### Equipment Table
```sql
CREATE TABLE equipment (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  status ENUM('operational', 'maintenance', 'fault', 'offline') NOT NULL,
  last_maintenance DATETIME,
  next_maintenance DATETIME,
  specifications JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Operational Data Table
```sql
CREATE TABLE operational_data (
  id VARCHAR(255) PRIMARY KEY,
  equipment_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP(3) NOT NULL,
  metrics JSON NOT NULL,
  alarms JSON,
  quality ENUM('good', 'uncertain', 'bad') NOT NULL,
  source VARCHAR(100) NOT NULL,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);
```

### Maintenance Records Table
```sql
CREATE TABLE maintenance_records (
  id VARCHAR(255) PRIMARY KEY,
  equipment_id VARCHAR(255) NOT NULL,
  type ENUM('preventive', 'corrective', 'emergency') NOT NULL,
  scheduled_date DATETIME NOT NULL,
  completed_date DATETIME,
  technician VARCHAR(255),
  description TEXT NOT NULL,
  parts JSON,
  cost DECIMAL(10,2),
  status ENUM('scheduled', 'in-progress', 'completed', 'cancelled') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);
```

## Connection Usage

```typescript
import { getGlobalDatabaseManager } from '@/lib/database'

// Get the database manager
const dbManager = await getGlobalDatabaseManager()

// Use specific production databases
const industrialDB = dbManager.getConnection('industrial_prod')
const operationalDB = dbManager.getConnection('operational_prod') 
const maintenanceDB = dbManager.getConnection('maintenance_prod')
const analyticsDB = dbManager.getConnection('analytics_prod')

// Use staging database
const stagingDB = dbManager.getConnection('industrial_staging')

// Query examples
const equipment = await industrialDB.query(
  'SELECT * FROM equipment WHERE status = ?', 
  ['operational']
)

const recentData = await operationalDB.query(`
  SELECT * FROM operational_data 
  WHERE timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)
  ORDER BY timestamp DESC
`)
```

## Security Considerations

### SSL/TLS Configuration
- **rejectUnauthorized**: Always `true` in production
- **Certificate validation**: Required for all connections
- **Encryption**: All data in transit is encrypted

### Network Security
- Configure **Authorized Networks** in Cloud SQL to restrict IP access
- Use **private IPs** when possible for additional security
- Implement **connection pooling** to manage resource usage

### Access Control
- Use **dedicated database user** with minimal required privileges
- **Rotate passwords** regularly
- **Monitor connection logs** for suspicious activity

## Health Monitoring

```typescript
// Check all database health
const healthStatus = await dbManager.getHealthStatus()
console.log(healthStatus)

// Example output:
// {
//   industrial_prod: { healthy: true, type: 'mysql' },
//   operational_prod: { healthy: true, type: 'mysql' },
//   maintenance_prod: { healthy: true, type: 'mysql' },
//   analytics_prod: { healthy: true, type: 'mysql' },
//   industrial_staging: { healthy: false, type: 'mysql', error: 'Connection timeout' }
// }
```

## Troubleshooting

### Common Issues

1. **SSL Certificate Errors**
   ```
   Error: SSL connection error: unable to verify the first certificate
   ```
   - Verify certificate paths are correct
   - Check certificate content format
   - Ensure `rejectUnauthorized: true` with valid certificates

2. **Connection Timeouts**
   ```
   Error: connect ETIMEDOUT
   ```
   - Check authorized networks configuration
   - Verify public IP address is correct
   - Increase `CLOUD_SQL_TIMEOUT` value

3. **Authentication Failures**
   ```
   Error: Access denied for user
   ```
   - Verify username/password combination
   - Check user permissions on specific databases
   - Ensure SSL-only connection requirement is met

### Connection Testing

```typescript
import { getConnectionTestQuery, getSecurityCheckQuery } from '@/lib/database/cloud-sql-config'

// Test basic connection
const testResult = await connection.query(getConnectionTestQuery())
console.log('Connection test:', testResult.data)

// Verify SSL configuration
const securityCheck = await connection.query(getSecurityCheckQuery())
console.log('Security status:', securityCheck.data)
```

## Production Deployment

### Vercel Configuration

Add these environment variables to your Vercel project:

1. **Project Settings** → **Environment Variables**
2. Add all Cloud SQL environment variables
3. For certificates, use the content format (not file paths)
4. Set appropriate values for production/preview/development environments

### Environment-specific Settings

```bash
# Production
NODE_ENV=production
DEFAULT_DATABASE=industrial_prod

# Staging  
NODE_ENV=staging
DEFAULT_DATABASE=industrial_staging

# Development (local)
NODE_ENV=development
DEFAULT_DATABASE=neo4j  # fallback to local Neo4j
```

## Performance Optimization

### Connection Pooling
- **Maximum connections**: 5 per database (Enterprise HA supports more)
- **Idle timeout**: 5 minutes
- **Connection reuse**: Enabled by default

### Query Optimization
- Use **prepared statements** for repeated queries
- Implement **query result caching** where appropriate
- Monitor **slow query logs** in Cloud SQL

### Monitoring
- Enable **Query Insights** in Cloud SQL
- Set up **alerting** for connection issues
- Monitor **connection pool usage**