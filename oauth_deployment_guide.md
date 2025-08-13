# OAuth-Enabled Remote MCP Server for Claude.ai

This implementation provides a complete OAuth 2.1 compliant MCP server that works with Claude.ai's custom connector system.

## Key OAuth Requirements for Claude.ai

Based on the latest MCP specification and Claude.ai requirements:

### 1. **Dynamic Client Registration (RFC 7591)**
Claude.ai requires automatic client registration - it cannot use pre-configured client IDs. The server must support:
- `POST /oauth/register` endpoint
- Automatic client credential generation
- Support for Claude's callback URLs

### 2. **Server Metadata Discovery (RFC 8414)**
Claude.ai discovers OAuth endpoints automatically via:
- `GET /.well-known/oauth-authorization-server` - OAuth server metadata
- `GET /.well-known/oauth-protected-resource` - Resource server metadata (RFC 9728)

### 3. **PKCE Support (RFC 7636)**
For security, the server supports Proof Key for Code Exchange:
- S256 code challenge method
- Code verifier validation during token exchange

### 4. **Claude.ai Specific Details**
- **OAuth Callback URL**: `https://claude.ai/api/mcp/auth_callback`
- **Client Name**: `Claude`
- **Required Scopes**: `mcp:tools`, `mcp:resources`, `mcp:prompts`
- **Bearer Token**: Must be included in `Authorization` header for all MCP requests

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Project

```bash
npm run build
```

### 3. Environment Variables

Create a `.env` file:

```bash
PORT=3000
BASE_URL=https://your-domain.com
JWT_SECRET=your-secret-key-here
```

### 4. Deploy to Production

#### Option A: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

#### Option B: Render
```bash
# Connect your GitHub repo to Render
# Set build command: npm run build
# Set start command: npm start
```

#### Option C: Heroku
```bash
# Install Heroku CLI
heroku create your-app-name
git push heroku main
```

### 5. Register with Claude.ai

1. Go to [claude.ai](https://claude.ai) (requires Pro/Max/Team/Enterprise plan)
2. Navigate to Settings → Integrations
3. Click "Add custom connector"
4. Enter your server URL: `https://your-domain.com`
5. Click "Add"

## OAuth Flow Explanation

### 1. **Discovery Phase**
```
Claude.ai → GET /.well-known/oauth-authorization-server
Server → Returns OAuth endpoints and capabilities
```

### 2. **Dynamic Registration**
```
Claude.ai → POST /oauth/register
Request: { "client_name": "Claude", "redirect_uris": [...] }
Server → { "client_id": "...", "client_secret": "..." }
```

### 3. **Authorization**
```
Claude.ai → GET /oauth/authorize?response_type=code&client_id=...
Server → Redirects to Claude with authorization code
```

### 4. **Token Exchange**
```
Claude.ai → POST /oauth/token
Request: { "grant_type": "authorization_code", "code": "..." }
Server → { "access_token": "...", "token_type": "Bearer" }
```

### 5. **MCP Communication**
```
Claude.ai → POST /mcp/streamable
Headers: { "Authorization": "Bearer ..." }
Server → Validates token and processes MCP request
```

## Security Features

### JWT Access Tokens
- Stateless token validation
- Includes user ID, client ID, and scope
- Signed with server secret
- 1-hour expiration

### Token Validation
Every MCP request validates:
- Bearer token presence
- JWT signature validity
- Token expiration
- Appropriate scope

### PKCE Protection
- Prevents authorization code interception
- Uses SHA256 code challenge
- Validates code verifier during token exchange

## Testing Your Server

### 1. Test OAuth Discovery
```bash
curl https://your-domain.com/.well-known/oauth-authorization-server
```

### 2. Test Dynamic Registration
```bash
curl -X POST https://your-domain.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "redirect_uris": ["https://example.com/callback"]
  }'
```

### 3. Test MCP Without Auth (should fail)
```bash
curl -X POST https://your-domain.com/mcp/streamable \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

## Common Issues & Solutions

### 1. **CORS Errors**
- Ensure your domain allows `https://claude.ai` origin
- Include proper CORS headers for preflight requests

### 2. **Token Validation Failures**
- Check JWT secret consistency
- Verify token format and signature
- Ensure clock synchronization for expiration

### 3. **Registration Issues**
- Confirm Dynamic Client Registration is enabled
- Validate redirect URI matching
- Check Claude's callback URL allowlist

### 4. **Discovery Problems**
- Ensure metadata endpoints return valid JSON
- Check proper HTTP status codes (200)
- Validate required OAuth metadata fields

## Production Considerations

### 1. **Database Storage**
In production, replace in-memory storage with persistent database:
- Client registrations
- Authorization codes
- Access tokens (or use stateless JWTs)

### 2. **Rate Limiting**
Implement rate limiting for:
- Client registration endpoint
- Authorization requests
- Token requests

### 3. **Monitoring**
Monitor:
- Failed authorization attempts
- Token validation errors
- MCP request patterns
- Client registration activity

### 4. **Security Hardening**
- Use HTTPS everywhere
- Implement proper CSRF protection
- Add request logging and anomaly detection
- Regular security audits

## Using with External OAuth Providers

For enterprise scenarios, you can integrate with existing OAuth providers:

### Auth0 Integration
- Enable Dynamic Application Registration
- Configure domain-level connections
- Use Auth0 as authorization server, your MCP server as resource server

### Azure AD/Entra ID
- Requires custom implementation due to limited DCR support
- Use Azure API Management as OAuth gateway
- Implement token exchange patterns

### Custom Implementation
The provided server acts as both authorization and resource server, suitable for:
- Development and testing
- Simple deployments
- Custom user management systems

For enterprise production usage, consider delegating authorization to established OAuth providers while keeping your MCP server as the resource server.