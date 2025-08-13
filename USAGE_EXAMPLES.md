# Industrial MCP Server - Usage Examples

Real-world examples of using Industrial MCP Server with Claude.ai web integration.

## 🏢 Business Intelligence Queries

### Marketing Analytics
**Query**: "Show me conversion funnel analysis for the last 30 days"

**Tools Used**:
- `get_visitor_analytics` (date_range: "last_30_days")
- `get_conversion_metrics` (date_range: "last_30_days") 
- `get_content_performance` (content_type: "entry_pages")

**Expected Response**:
```json
{
  "visitors": {
    "total_visits": 12845,
    "unique_visitors": 8932,
    "bounce_rate": "34.2%"
  },
  "conversions": {
    "goal_conversions": 234,
    "conversion_rate": "2.6%",
    "revenue_generated": "$45,680"
  },
  "top_entry_pages": [
    "/products/analytics-platform",
    "/solutions/enterprise",
    "/demo"
  ]
}
```

### Operational Intelligence
**Query**: "Find employees with machine learning skills and their department structure"

**Tools Used**:
- `find_capability_paths` (skill: "machine learning")
- `get_organizational_structure` (include_employees: true)
- `query_knowledge_graph` (custom Cypher for skill networks)

**Expected Response**:
```json
{
  "skilled_employees": [
    {
      "name": "Dr. Sarah Chen",
      "department": "Data Science",
      "skills": ["machine learning", "deep learning", "python"],
      "reporting_manager": "VP Engineering"
    }
  ],
  "capability_paths": [
    {
      "path": "Junior Analyst → Data Scientist → ML Engineer",
      "skills_required": ["statistics", "python", "machine learning"]
    }
  ]
}
```

## 🔍 Advanced Multi-Database Queries

### Cross-Database Correlation
**Query**: "Correlate website visitors from Fortune 500 companies with our operational capabilities"

**Tools Used**:
- `get_company_intelligence` (filter by enterprise domains)
- `correlate_operational_relationships` (entity_type: "Company")
- `get_unified_dashboard_data` (company correlation)

**Example Result**:
```json
{
  "enterprise_visitors": [
    {
      "company": "Microsoft Corp",
      "visits": 47,
      "pages_viewed": ["/enterprise-solutions", "/api-docs"],
      "operational_match": {
        "services": ["Cloud Infrastructure", "API Management"],
        "employees_with_relevant_skills": 12
      }
    }
  ],
  "correlation_insights": {
    "high_value_prospects": 8,
    "capability_alignment": "78%",
    "recommended_outreach": ["Cloud Solutions Team", "Enterprise Sales"]
  }
}
```

### Real-time Dashboard Data
**Query**: "Create a unified dashboard showing web traffic, company intelligence, and operational metrics"

**Tools Used**:
- `get_unified_dashboard_data` (include_web_analytics: true, include_operational_data: true)
- `get_cloud_sql_status` (health monitoring)
- `get_knowledge_graph_stats` (operational stats)

## 📊 Scope-Specific Examples

### Analytics Scope (`read:analytics`)
```bash
# Available tools with analytics scope
- query_matomo_database
- get_visitor_analytics  
- get_conversion_metrics
- get_content_performance
- get_company_intelligence
```

**Example Query**: "What are our top performing content pieces by engagement?"
**Response**: Page analytics with time on page, bounce rates, and conversion paths.

### Knowledge Scope (`read:knowledge`)
```bash
# Available tools with knowledge scope  
- query_knowledge_graph
- get_organizational_structure
- find_capability_paths
- get_knowledge_graph_stats
```

**Example Query**: "Map out the skill dependencies for becoming a senior engineer"
**Response**: Career progression paths with required skills and mentoring relationships.

### Admin Scope (`admin:usage`)
```bash
# Available tools with admin scope
- get_usage_analytics
- get_cloud_sql_status
- get_cloud_sql_info
- explore_database
- analyze_data
```

**Example Query**: "Show me system health and API usage patterns"
**Response**: Database performance metrics, API usage by tool, and system status.

## 🛠️ Technical Implementation Examples

### OAuth Token Request
```bash
# Step 1: Authorization URL
https://industrial-mcp-delta.vercel.app/api/oauth/authorize?response_type=code&client_id=claude-web&redirect_uri=https://claude.ai/callback&scope=read:analytics+read:knowledge&code_challenge=xyz&code_challenge_method=S256

# Step 2: Token Exchange
POST https://industrial-mcp-delta.vercel.app/api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=AUTH_CODE&redirect_uri=https://claude.ai/callback&client_id=claude-web&code_verifier=xyz
```

### MCP Tool Call with OAuth
```bash
POST https://industrial-mcp-delta.vercel.app/api/mcp
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 1,
  "params": {
    "name": "get_visitor_analytics",
    "arguments": {
      "date_range": "last_7_days",
      "limit": 100
    }
  }
}
```

### Error Handling Examples
```json
// Insufficient permissions
{
  "error": "AUTHORIZATION_ERROR",
  "message": "Insufficient permissions for tool: get_usage_analytics",
  "required_scopes": ["admin:usage"],
  "current_auth": "OAuth client: claude-web (scopes: read:analytics)"
}

// Rate limiting
{
  "error": "RATE_LIMIT_ERROR", 
  "message": "Rate limit exceeded for user claude-web. Limit: 100 requests/hour",
  "retry_after": 3600
}
```

## 🎯 Real-World Scenarios

### Scenario 1: Product Manager Dashboard
**Need**: "I need to understand user behavior and feature adoption"

**Queries**:
1. "Show me user engagement metrics for our new dashboard feature"
2. "Which companies are most active on our platform?"
3. "What's the conversion rate from trial to paid plans?"

**Tools Used**: Analytics tools + company intelligence

### Scenario 2: Engineering Team Insights  
**Need**: "I want to understand our team's skill distribution and plan training"

**Queries**:
1. "Map out current engineering skills across all teams"
2. "Find skill gaps for upcoming AI projects"
3. "Show career progression paths for junior developers"

**Tools Used**: Knowledge graph tools + organizational structure

### Scenario 3: Executive Reporting
**Need**: "I need comprehensive metrics for board presentation"

**Queries**:
1. "Create a unified view of business metrics and operational capabilities"
2. "Show system health and usage analytics"
3. "Correlate customer engagement with our service offerings"

**Tools Used**: All scopes + cross-database correlation

## 📈 Performance Optimization

### Caching Strategy
- **Analytics queries**: 2-10 minutes based on data freshness needs
- **Knowledge graph**: 5-15 minutes (organizational data changes slowly)
- **System stats**: 30 seconds - 1 minute for real-time monitoring

### Rate Limiting
- **Default**: 100 requests/hour per OAuth client
- **Analytics**: Higher limits for dashboard applications
- **Admin**: Lower limits for sensitive operations

### Best Practices
1. **Use appropriate scopes** - Request only needed permissions
2. **Cache responses** - Reduce API calls for static data
3. **Batch queries** - Use unified dashboard tools when possible
4. **Monitor usage** - Track API consumption via usage analytics

---

**Integration Status**: ✅ Complete  
**Documentation**: Comprehensive  
**Examples**: Production-ready  
**Testing**: Validated on production deployment