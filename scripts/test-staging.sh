#!/bin/bash
# Quick test script for Cloud SQL staging database

echo "🧪 Testing Cloud SQL Staging Database: seoptinalytics-staging"
echo "=============================================================="

# Check if required environment variables are set
if [ -z "$CLOUD_SQL_HOST" ]; then
    echo "❌ CLOUD_SQL_HOST environment variable not set"
    exit 1
fi

if [ -z "$CLOUD_SQL_PASSWORD" ]; then
    echo "❌ CLOUD_SQL_PASSWORD environment variable not set"
    exit 1
fi

echo "✅ Environment variables configured"
echo "   Host: $CLOUD_SQL_HOST"
echo "   Database: seoptinalytics-staging"
echo ""

# Test Node.js script
echo "🚀 Running Cloud SQL connection test..."
node scripts/test-cloud-sql.js --database=industrial_staging --verbose

echo ""
echo "💡 Testing Tips:"
echo "   - Ensure your IP is in authorized networks"
echo "   - Verify SSL certificates are properly configured"
echo "   - Check that the staging database exists and is accessible"
echo ""
echo "🔧 Environment Variables Needed:"
echo "   export CLOUD_SQL_HOST=your-cloud-sql-ip"
echo "   export CLOUD_SQL_PASSWORD=your-password"
echo "   export CLOUD_SQL_CA_CERT=path-to-server-ca.pem"
echo "   export CLOUD_SQL_CLIENT_CERT=path-to-client-cert.pem"
echo "   export CLOUD_SQL_CLIENT_KEY=path-to-client-key.pem"