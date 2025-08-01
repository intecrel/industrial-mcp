# Google Cloud SQL Configuration Guide

This guide covers setting up the MCP application with your Google Cloud SQL Enterprise HA instance.

## Your Cloud SQL Setup

- **Instance Type**: Enterprise with High Availability (HA)
- **Database**: Matomo analytics data with IP-enriched visitor information
- **Connectivity**: Public IP with Authorized Networks
- **Security**: SSL/TLS encryption with trusted client certificates
- **Authentication**: SSL-only connections required

## Environment Variables

### Required Configuration

```bash
# Cloud SQL Connection Details
CLOUD_SQL_HOST=YOUR_CLOUD_SQL_PUBLIC_IP
CLOUD_SQL_PORT=3306
CLOUD_SQL_USERNAME=your_database_user
CLOUD_SQL_PASSWORD=YOUR_SECURE_PASSWORD

# SSL Certificates (preferred: certificate content, not file paths)
CLOUD_SQL_CA_CERT="-----BEGIN CERTIFICATE-----
MIIDfzCCAmegAwIBAgIBADANBgkqhkiG9w0BAQsFADA...
-----END CERTIFICATE-----"

CLOUD_SQL_CLIENT_CERT="-----BEGIN CERTIFICATE-----  
MIIDSTCCAjGgAwIBAgIBADANBgkqhkiG9w0BAQsFADA...
-----END CERTIFICATE-----"

CLOUD_SQL_CLIENT_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA4f6wg8OFnGdC8eQ5f3N1l8xJVfU...
-----END RSA PRIVATE KEY-----"

# Database Names (configure according to your actual databases)
CLOUD_SQL_DB_PRIMARY=your_primary_database_name
CLOUD_SQL_DB_STAGING=your_staging_database_name

# Connection Tuning
CLOUD_SQL_MAX_CONNECTIONS=5
CLOUD_SQL_TIMEOUT=30000

# Default Database Selection
DEFAULT_DATABASE=cloud_sql_primary  # or cloud_sql_staging for dev/test
```

## 🔐 Certificate Security

**IMPORTANT**: SSL certificates should NEVER be committed to GitHub.

### Recommended Approach: Environment Variables with Certificate Content
Store the full certificate content directly in environment variables (not file paths):

```bash
# Get your certificates from Google Cloud Console
gcloud sql ssl-certs describe CERT_NAME --instance=INSTANCE_NAME --format="value(cert)"
```

### Legacy File Path Support
File paths are still supported for local development, but certificate content in environment variables is preferred for production.

## Certificate Setup

**Recommended**: Store certificate content directly in environment variables.

```bash
# Get your certificates from Google Cloud Console or gcloud CLI:
gcloud sql ssl-certs describe YOUR_CERT_NAME --instance=YOUR_INSTANCE_NAME --format="value(cert)"
gcloud sql ssl-certs describe YOUR_CERT_NAME --instance=YOUR_INSTANCE_NAME --format="value(private_key)"
gcloud sql instances describe YOUR_INSTANCE_NAME --format="value(serverCaCert.cert)"
```

**For Development Only**: You can still use file paths, but they should NOT be committed to GitHub:
```bash
# Add to .gitignore:
certs/
*.pem
*.key
```

## Database Exploration

The MCP provides generic tools to explore and query your database structure dynamically. No predefined schemas are required - the system adapts to whatever tables and data you have.

### Database Discovery Tools
- **Table listing**: Discover all tables in your database
- **Schema inspection**: View table structures and column information  
- **Data sampling**: Preview data from any table
- **Query execution**: Run custom SQL queries safely

### Example Database Exploration
```sql
-- List all tables
SHOW TABLES;

-- Inspect table structure
DESCRIBE your_table_name;

-- Sample data from any table
SELECT * FROM your_table_name LIMIT 10;

-- Custom analytics queries
SELECT COUNT(*) as total_records, 
       DATE(created_at) as date
FROM your_table_name 
GROUP BY DATE(created_at) 
ORDER BY date DESC;
```

## Connection Usage

```typescript
import { getGlobalDatabaseManager } from '@/lib/database'

// Get the database manager
const dbManager = await getGlobalDatabaseManager()

// Use primary or staging database connections
const primaryDB = dbManager.getConnection('cloud_sql_primary')
const stagingDB = dbManager.getConnection('cloud_sql_staging')

// Discover database structure
const tables = await primaryDB.query('SHOW TABLES')
console.log('Available tables:', tables.data)

// Inspect table schema
const tableSchema = await primaryDB.query('DESCRIBE visitor_info')
console.log('Table structure:', tableSchema.data)

// Query examples for analytics data
const recentVisitors = await primaryDB.query(`
  SELECT * FROM visitor_data 
  WHERE visit_date > DATE_SUB(NOW(), INTERVAL 1 DAY)
  ORDER BY visit_date DESC
  LIMIT 100
`)

// Aggregate analytics
const dailyStats = await primaryDB.query(`
  SELECT DATE(visit_date) as date,
         COUNT(*) as total_visits,
         COUNT(DISTINCT visitor_ip) as unique_visitors
  FROM visitor_data 
  WHERE visit_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  GROUP BY DATE(visit_date)
  ORDER BY date DESC
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
//   cloud_sql_primary: { healthy: true, type: 'mysql' },
//   cloud_sql_staging: { healthy: true, type: 'mysql' },
//   neo4j: { healthy: false, type: 'neo4j', error: 'Connection timeout' }
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
DEFAULT_DATABASE=cloud_sql_primary

# Staging  
NODE_ENV=staging
DEFAULT_DATABASE=cloud_sql_staging

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