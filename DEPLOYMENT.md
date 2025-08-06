# Industrial MCP – Deployment Guide

This document explains **how to deploy the Industrial MCP Next.js application to Vercel** with a complete CI/CD workflow, configure all required environment variables, expose the MCP endpoints, let external services connect, verify the installation, and troubleshoot the most common problems.

---

## 1. Branch Strategy & CI/CD Workflow

### 1.1 Branch Strategy
- **`main`** - Production deployments (auto-deploy to production URL)
- **`develop`** - Staging/preview deployments for integration testing
- **`feature/*`** - Feature branch deployments (auto-preview on push)

### 1.2 GitHub Actions Workflows
Two automated workflows handle deployments:

#### Production Deployment (`main` branch)
- **Trigger**: Push to `main` branch or manual dispatch
- **Process**: Lint → Build → Deploy → Test Production
- **URL**: https://industrial-mcp-delta.vercel.app
- **Tests**: Full production test suite with `npm run test:prod`

#### Preview Deployment (`develop`, `feature/*` branches)
- **Trigger**: Push to `develop`/`feature/*` or PR to `main`/`develop`
- **Process**: Lint → Build → Deploy → Comment PR with preview URL
- **URL**: Dynamic Vercel preview URLs
- **Tests**: Automated preview testing with `npm run test:preview`

### 1.3 Prerequisites
- GitHub repository with Actions enabled
- Vercel account with GitHub integration
- Neo4j Aura instance (or self-hosted) for graph features
- Required GitHub Secrets (see section 2.2)

### 1.4 Quick Start Deployment
1. **Fork/Clone**: Set up the repository with GitHub integration
2. **Configure Secrets**: Add required GitHub and Vercel secrets
3. **Push to Develop**: Test preview deployment workflow
4. **Merge to Main**: Deploy to production

> **Automated Deployments**: All deployments are automated via GitHub Actions. Manual deployments available via `npm run deploy:preview` and `npm run deploy:prod`.

---

## 2. Environment Configuration

### 2.1 Application Environment Variables

| Variable                 | Required | Example / Notes                                      |
|--------------------------|----------|------------------------------------------------------|
| `MAC_ADDRESS`           | ✔        | 00:22:33:44:55:66 – authorised device address        |
| `API_KEY`               | ✔        | long-random-string used by external clients          |
| `ALLOWED_IPS`           | ✖        | Comma-separated IPv4/6 addresses that bypass MAC check |
| `ACCESS_TOKEN`          | ✖        | Claude / Anthropic API key (if used)                 |
| `NEO4J_URI`             | ✖        | neo4j+s://xxxxx.databases.neo4j.io                   |
| `NEO4J_USERNAME`        | ✖        | neo4j                                               |
| `NEO4J_PASSWORD`        | ✖        | ********                                            |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | ✖ | Cloud SQL credentials JSON string     |
| `CLOUD_SQL_CONNECTION_NAME` | ✖     | project:region:instance for Cloud SQL                |

### 2.2 GitHub Secrets (Required for CI/CD)

| Secret                  | Purpose                                               |
|-------------------------|-------------------------------------------------------|
| `VERCEL_TOKEN`         | Vercel authentication token for deployments          |
| `VERCEL_ORG_ID`        | Vercel organization ID                               |
| `VERCEL_PROJECT_ID`    | Vercel project ID                                    |
| `PROD_API_KEY`         | Production API key for testing                       |
| `PROD_MAC_ADDRESS`     | Production MAC address for testing                   |

### 2.3 Environment Setup Steps

#### Vercel Environment Variables
1. Go to **Vercel → Project → Settings → Environment Variables**
2. Add variables for each environment:
   - **Production**: Values for production deployment
   - **Preview**: Values for preview/staging deployments  
   - **Development**: Values for local development

#### GitHub Repository Secrets
1. Go to **GitHub → Repository → Settings → Secrets and Variables → Actions**
2. Add all required secrets from section 2.2
3. Obtain Vercel tokens from **Vercel → Settings → Tokens**

> **Template Available**: Use `.env.example` as a template for local development environment setup.

---

## 3. Deployment Testing & Validation

### 3.1 Available Test Scripts

| Script | Purpose | Usage |
|--------|---------|--------|
| `npm run test:local` | Test local development server | Requires server running on localhost:3000 |
| `npm run test:preview` | Test preview deployment | Automatic in CI/CD, manual via script |  
| `npm run test:prod` | Test production deployment | Requires production URL and credentials |
| `npm run test:build` | Build and test locally | Full local testing pipeline |

### 3.2 Preview Deployment Testing

#### Automated Testing (GitHub Actions)
Preview deployments are automatically tested when:
- Creating/updating pull requests
- Pushing to `develop` or `feature/*` branches

#### Manual Preview Testing
```bash
# Test a specific preview URL
node scripts/test-preview.js https://your-preview-url.vercel.app your-api-key

# With verbose output  
VERBOSE=true node scripts/test-preview.js https://your-preview-url.vercel.app your-api-key
```

#### Test Coverage
- ✅ Basic health check (`/api/verify/status`)
- ✅ MCP tools availability (18 total tools)
- ✅ Neo4j knowledge graph connectivity
- ✅ MySQL/Cloud SQL analytics tools
- ✅ Cross-database correlation tools

### 3.3 Production Deployment Process

#### Automated Production Deployment
1. **Merge to Main**: Pull request merged to `main` branch
2. **GitHub Actions**: Automatically triggered production workflow
3. **Build & Test**: Lint, build, and deploy to production URL
4. **Validation**: Production test suite with `npm run test:prod`
5. **Notification**: Success/failure status and deployment URL

#### Manual Production Deployment
```bash
# Deploy to production
npm run deploy:prod  

# Test production deployment
MCP_PROD_URL=https://industrial-mcp-delta.vercel.app npm run test:prod
```

---

## 4. MCP Endpoint Configuration

The application provides comprehensive MCP endpoints with 18+ industrial tools:

### 4.1 Available Endpoints

| Route | Purpose | Auth |
|-------|---------|------|
| `POST /api/verify` | Verify device MAC address, sets `mcp-verified` cookie | none |
| `GET  /api/verify/status` | Returns `{ verified: boolean }` | cookie |
| `GET/POST /api/[transport]` | MCP protocol interface (multiple transports) | `x-api-key` header |

### 4.2 MCP Transport Support
- **SSE**: `/api/sse` - Server-Sent Events transport
- **HTTP**: `/api/mcp` - Standard HTTP transport  
- **WebSocket**: `/api/ws` - WebSocket transport (if enabled)

### 4.3 Available MCP Tools (18 Total)
- **Knowledge Graph**: Neo4j queries, organizational structure, capability paths
- **Database Analytics**: MySQL/Cloud SQL connection, visitor analytics (Matomo)
- **Cross-Database**: Correlation analysis between Neo4j and MySQL
- **System Monitoring**: Equipment monitoring, operational data
- **Utility Tools**: Echo, system status, schema validation

CORS headers are automatically configured via `vercel.json`, allowing secure cross-origin access.

---

## 5. Connecting External Services & Claude Desktop

### 5.1 Claude Desktop Integration

#### MCP Server Configuration
Add to Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "industrial-mcp": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-stdio"],
      "env": {
        "MCP_SERVER_URL": "https://industrial-mcp-delta.vercel.app/api/mcp",
        "MCP_API_KEY": "your-production-api-key"
      }
    }
  }
}
```

#### Direct HTTP Connection
```bash
# Test MCP tools list
curl -X POST https://industrial-mcp-delta.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

### 5.2 API Integration Examples

#### Basic Knowledge Graph Query
```javascript
const response = await fetch('https://industrial-mcp-delta.vercel.app/api/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.MCP_API_KEY
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'query_knowledge_graph',
      arguments: {
        query: 'MATCH (w:Worker)-[:REQUIRES_SKILL]->(s:Skill) RETURN w.name, s.name LIMIT 10'
      }
    }
  })
});
```

#### Analytics Query (Matomo/MySQL)
```javascript
const analyticsResponse = await fetch('https://industrial-mcp-delta.vercel.app/api/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json', 
    'x-api-key': process.env.MCP_API_KEY
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2, 
    method: 'tools/call',
    params: {
      name: 'analyze_data',
      arguments: {
        table_name: 'matomo_log_visit',
        analysis_type: 'summary'
      }
    }
  })
});
```

### 5.3 Authentication & Security
- **API Key Required**: All MCP endpoints require `x-api-key` header
- **MAC Address Verification**: Additional security layer for device verification
- **CORS Enabled**: Cross-origin requests allowed for web integrations
- **Rate Limiting**: Implemented via Vercel edge functions

---

## 6. Manual Testing & Validation

### 6.1 Production Deployment Validation

#### Step 1: Health Check
```bash
curl https://industrial-mcp-delta.vercel.app/api/verify/status
# Expected: {"status":"success","verified":false}
```

#### Step 2: MCP Tools Verification  
```bash
curl -X POST https://industrial-mcp-delta.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "jsonrpc": "2.0", 
    "id": 1,
    "method": "tools/list"
  }'
# Expected: List of 18+ MCP tools
```

#### Step 3: Knowledge Graph Test
```bash
curl -X POST https://industrial-mcp-delta.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2, 
    "method": "tools/call",
    "params": {
      "name": "get_knowledge_graph_stats",
      "arguments": {}
    }
  }'
# Expected: Neo4j statistics (nodes, relationships, etc.)
```

### 6.2 Automated Test Suites

#### Local Development Testing
```bash
# Start development server
npm run dev

# Run comprehensive local tests
npm run test:local
```

#### Preview Deployment Testing  
```bash
# Test specific preview URL
node scripts/test-preview.js https://your-preview-url.vercel.app your-api-key

# Verbose testing output
VERBOSE=true node scripts/test-preview.js https://preview-url.vercel.app api-key
```

#### Production Testing
```bash
# Test production deployment
npm run test:prod

# Custom production URL testing
MCP_PROD_URL=https://custom-url.vercel.app npm run test:prod
```

### 6.3 Test Results Interpretation

#### Success Indicators
- ✅ Health check responds with `status: "success"`
- ✅ MCP tools list returns 18+ tools
- ✅ Neo4j knowledge graph stats show nodes/relationships
- ✅ MySQL analytics tools accessible
- ✅ Cross-database correlation tools functional

#### Failure Debugging
- **401 Unauthorized**: Check API key configuration
- **502 Bad Gateway**: Verify environment variables and database connections
- **Timeout Errors**: Check network connectivity and database availability
- **CORS Errors**: Verify `vercel.json` CORS configuration

---

## 7. Troubleshooting & Common Issues

### 7.1 Deployment Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| **Build fails on Vercel** | Node version mismatch or dependency issues | Ensure Node 18+, check `package.json` engines field |
| **GitHub Actions failing** | Missing secrets or incorrect workflow | Verify all GitHub secrets in section 2.2 |
| **Preview deployment not created** | Branch naming or workflow trigger issue | Ensure branch follows `feature/*` pattern |
| **Environment variables not available** | Incorrect Vercel environment setup | Check Vercel project settings for each environment |

### 7.2 API & Authentication Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| **401 Unauthorized from MCP** | Missing/incorrect API key | Pass `x-api-key` header with correct value |
| **403 MAC address verification fails** | Wrong MAC_ADDRESS env value | Verify MAC format (colons, lowercase) |
| **404 Not Found on MCP endpoints** | Incorrect endpoint URL | Use `/api/mcp`, `/api/sse`, or `/api/[transport]` |
| **CORS errors in browser** | Origin not allowed | Check `vercel.json` CORS configuration |

### 7.3 Database Connection Issues  

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| **502 from Neo4j queries** | Wrong NEO4J_URI or credentials | Verify Aura connection string & authentication |
| **MySQL/Cloud SQL errors** | Missing Google credentials | Check `GOOGLE_APPLICATION_CREDENTIALS_JSON` |  
| **Timeout on database queries** | Network connectivity or firewall | Verify IP whitelisting and network access |
| **Empty query results** | Database not populated | Verify data exists and query syntax |

### 7.4 Testing & Validation Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| **Test script failures** | Wrong URL or credentials | Check API key and MAC address in environment |
| **MCP tools not found** | Build or deployment issue | Verify successful deployment and tool registration |
| **Preview tests timeout** | Slow cold start or resource limits | Wait for warm-up or check Vercel function limits |
| **Production tests fail** | Environment differences | Compare prod vs preview environment variables |

### 7.5 Development Workflow Issues

#### GitHub Actions Debugging
```bash
# Check workflow status
gh workflow list
gh run list --workflow="Vercel Production Deployment"

# View specific run logs  
gh run view [run-id] --log
```

#### Local Development Issues
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Reset local development
npm run build && npm run dev
```

#### Vercel CLI Debugging
```bash
# Login and link project
vercel login
vercel link

# Check deployment logs
vercel logs [deployment-url]

# Manual deployment with verbose output
vercel --debug
```

---

### 7.6 Getting Support

#### Documentation & Resources
- **CLAUDE.md**: Project-specific instructions and commands
- **README.md**: General project overview and setup
- **.env.example**: Environment variable template
- **GitHub Issues**: Bug reports and feature requests

#### Debug Information to Collect
1. **Environment**: Local, preview, or production
2. **Error Messages**: Full error text and stack traces  
3. **Network**: Request/response headers and payloads
4. **Configuration**: Environment variables (redacted sensitive values)
5. **Deployment**: Vercel deployment URL and build logs

#### Contact & Support
- **GitHub Issues**: [Repository Issues Page](https://github.com/akbarkhawaja/industrial-mcp/issues)
- **Documentation**: This DEPLOYMENT.md file and CLAUDE.md
- **Testing**: Use provided test scripts for systematic debugging

---

*Happy deploying! 🚀*
