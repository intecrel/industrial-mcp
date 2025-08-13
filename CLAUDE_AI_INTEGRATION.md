# Claude.ai Web Integration Guide - IMCP-51 Complete ✅

This guide provides step-by-step instructions for integrating Industrial MCP Server with Claude.ai's custom MCP connector feature.

## 🎯 Integration Overview

Industrial MCP Server is now a **standards-compliant Remote MCP Server** with OAuth 2.1 authentication, enabling direct integration with Claude.ai web interface without bridge scripts.

### Key Features
- **OAuth 2.1 Authentication** with PKCE support
- **Dual Authentication** (OAuth + legacy MAC address)
- **18 Database Tools** across Neo4j Knowledge Graph and MySQL Analytics
- **Real-time Multi-database Queries**
- **Scope-based Access Control**

## 🚀 Quick Setup for Claude.ai

### Step 1: Access Configuration Endpoint
Get your pre-configured settings:
```bash
curl https://industrial-mcp-delta.vercel.app/api/claude/config
```

### Step 2: Claude.ai Custom Connector Setup
1. Go to **Claude.ai** → **Settings** → **Feature Preview**
2. Enable **Custom MCP Connectors** (if available)
3. Add new MCP connector with these settings:

**Server Configuration:**
```json
{
  "name": "Industrial MCP Server",
  "serverEndpoint": "https://industrial-mcp-delta.vercel.app/api/mcp",
  "authType": "oauth2",
  "oauth": {
    "authorizationEndpoint": "https://industrial-mcp-delta.vercel.app/api/oauth/authorize",
    "tokenEndpoint": "https://industrial-mcp-delta.vercel.app/api/oauth/token", 
    "scope": "read:analytics read:knowledge admin:usage",
    "clientId": "claude-web"
  }
}
```

### Step 3: Authorization Flow
1. Claude.ai will redirect you to our OAuth authorization endpoint
2. Grant permissions for the requested scopes
3. You'll be redirected back to Claude.ai with access token
4. Claude.ai can now access Industrial MCP tools!

## 🛠️ Available Tools & Scopes

### Analytics Tools (`read:analytics` scope)
- `query_matomo_database` - Execute custom analytics queries
- `get_visitor_analytics` - Traffic patterns and user behavior  
- `get_conversion_metrics` - Goal tracking and funnel analysis
- `get_content_performance` - Page views and engagement
- `get_company_intelligence` - B2B visitor insights

### Knowledge Graph Tools (`read:knowledge` scope)  
- `query_knowledge_graph` - Custom Cypher queries
- `get_organizational_structure` - Department hierarchies
- `find_capability_paths` - Skill networks and career paths
- `get_knowledge_graph_stats` - Database statistics

### System Tools (`admin:usage` scope)
- `get_usage_analytics` - API usage statistics
- `get_cloud_sql_status` - Database health monitoring
- `explore_database` - Schema exploration
- `analyze_data` - Generate insights

### Cross-Database Tools (Combined scopes)
- `get_unified_dashboard_data` - Multi-database dashboard
- `correlate_operational_relationships` - Cross-database analysis

## 📋 Usage Examples

### Example 1: Analytics Query
```
"Show me visitor analytics for the last 7 days including top pages and conversion rates"
```
Claude.ai will use:
- `get_visitor_analytics` with `date_range: "last_7_days"`
- `get_content_performance` for page views
- `get_conversion_metrics` for conversion data

### Example 2: Knowledge Graph Exploration  
```
"Find all employees with data science skills and their reporting structure"
```
Claude.ai will use:
- `find_capability_paths` with `skill: "data science"`
- `get_organizational_structure` for hierarchy
- `query_knowledge_graph` for detailed relationships

### Example 3: Cross-Database Insights
```
"Correlate website visitors from tech companies with our operational capabilities"
```
Claude.ai will use:
- `get_company_intelligence` for B2B visitor data
- `correlate_operational_relationships` for operational matching
- `get_unified_dashboard_data` for comprehensive view

## 🔧 Advanced Configuration

### Custom Scopes
Request specific scopes based on your needs:
- **Read-only Analytics**: `read:analytics`
- **Knowledge Graph Only**: `read:knowledge`  
- **Full Access**: `read:analytics read:knowledge admin:usage`

### Error Handling
The server provides detailed error responses:
```json
{
  "error": "AUTHORIZATION_ERROR",
  "message": "Insufficient permissions for tool: get_usage_analytics",
  "required_scopes": ["admin:usage"],
  "current_auth": "OAuth client: claude-web (scopes: read:analytics read:knowledge)"
}
```

## 🧪 Testing & Validation

### Test Connectivity
```bash
# Test OAuth metadata
curl https://industrial-mcp-delta.vercel.app/.well-known/oauth-authorization-server

# Test MCP endpoint (requires authentication)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://industrial-mcp-delta.vercel.app/api/mcp
```

### Validate Tools Access
Use Claude.ai to test tool access:
1. "List all available MCP tools"
2. "Show me knowledge graph statistics"  
3. "Get visitor analytics for today"

## 📚 Support & Documentation

### Configuration Helper
- **Setup Guide**: `https://industrial-mcp-delta.vercel.app/claude-integration`
- **API Config**: `https://industrial-mcp-delta.vercel.app/api/claude/config`
- **Support Docs**: `https://industrial-mcp-delta.vercel.app/api/claude/support`

### Legacy Bridge Script (Fallback)
If OAuth integration isn't available, use the bridge script:
```bash
# Set environment variables
export MCP_SERVER_URL="https://industrial-mcp-delta.vercel.app/api/mcp"
export MCP_OAUTH_TOKEN="your-oauth-token"

# Run bridge script
node industrial-mcp-bridge-prod.js
```

## ✅ IMCP-51 Acceptance Criteria Completed

- ✅ **Test custom MCP connector functionality** - OAuth 2.1 endpoints validated
- ✅ **Verify web interface tool accessibility** - 18 tools available via scopes
- ✅ **Document configuration steps** - Complete guide provided
- ✅ **Test multi-database queries** - Neo4j + MySQL tools working
- ✅ **Create usage examples** - Comprehensive examples included

## 🎉 Integration Benefits

### For Users
- **No Bridge Scripts Required** - Direct Claude.ai integration
- **Secure OAuth 2.1 Authentication** - Industry standard security
- **Scope-based Permissions** - Granular access control
- **Multi-database Access** - Neo4j + MySQL in one interface

### For Developers  
- **Standards Compliant** - OAuth 2.1 + MCP protocol
- **Backward Compatible** - Existing API key auth still works
- **Comprehensive Logging** - OAuth usage analytics
- **Extensible Architecture** - Easy to add new tools/scopes

---

**Status**: IMCP-51 Story Complete ✅  
**Epic**: IMCP-61 Remote MCP Server Complete ✅  
**Production**: https://industrial-mcp-delta.vercel.app  
**Integration Guide**: https://industrial-mcp-delta.vercel.app/claude-integration