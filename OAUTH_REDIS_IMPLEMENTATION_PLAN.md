# OAuth Redis Persistence Implementation Plan

## Problem Analysis
The existing OAuth implementation is **stateless** and uses in-memory storage, causing MCP connection failures after successful OAuth flows. Claude.ai completes OAuth but receives -32000 errors when accessing MCP tools because tokens aren't persisted across requests.

## Root Cause Identified
1. **In-memory storage**: `registeredClients = new Map()` in `lib/oauth/clients.ts:38` loses data on each serverless function invocation
2. **No token persistence**: JWT tokens are stateless but client registrations and authorization codes are lost
3. **Vercel serverless limitations**: Each request spawns new instances, clearing memory

## Vercel Preview Deployment Strategy

### **Phase 1: Preview Infrastructure**
1. **Setup Upstash Redis** for preview environment
2. **Configure preview environment variables** in Vercel
3. **Create feature branch**: `feature/oauth-redis-persistence`

### **Phase 2: Implementation**
1. **Install Redis dependencies**: `@upstash/redis`
2. **Create storage abstraction layer** (`lib/oauth/storage.ts`)
3. **Update client registration** to use Redis instead of in-memory Map
4. **Add environment detection** (preview vs production vs development)
5. **Implement graceful fallback** to in-memory if Redis unavailable

### **Phase 3: Testing Pipeline**
1. **Push to feature branch** → Automatic Vercel preview deployment
2. **Run automated tests** against preview URL
3. **Test OAuth flow** with claude.ai using preview deployment
4. **Validate token persistence** across serverless function restarts
5. **Performance benchmarking** and monitoring

### **Phase 4: Production Deployment**
1. **Sync develop with main** (following documented Git workflow)
2. **Create PR**: `develop → main` 
3. **Production deployment** via GitHub Actions
4. **Setup production Redis** instance
5. **Monitor and validate** production OAuth flows

## Technical Implementation Details

### Redis Solution Architecture

#### Storage Adapter Interface
```typescript
// New file: lib/oauth/storage.ts
interface StorageAdapter {
  setClient(clientId: string, client: OAuthClient): Promise<void>
  getClient(clientId: string): Promise<OAuthClient | null>
  setAuthCode(code: string, data: AuthCodeData, ttl: number): Promise<void>
  getAuthCode(code: string): Promise<AuthCodeData | null>
  deleteAuthCode(code: string): Promise<void>
}
```

#### Storage Keys Strategy
- Client registrations: `oauth:client:{clientId}`
- Authorization codes: `oauth:code:{code}` (10min TTL)
- Rate limiting: `oauth:rate:{clientId}:{hour}` (1hr TTL)

#### Environment Variables
```bash
# Preview Environment
UPSTASH_REDIS_REST_URL=https://preview-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=preview-token
OAUTH_JWT_SECRET=preview-jwt-secret
ENABLE_REDIS_STORAGE=true

# Production Environment
UPSTASH_REDIS_REST_URL=https://prod-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=prod-token
OAUTH_JWT_SECRET=prod-jwt-secret
ENABLE_REDIS_STORAGE=true
```

### Development Workflow

#### Branch Strategy (Following existing pattern)
```bash
# Work on feature branch
git checkout develop
git checkout -b feature/oauth-redis-persistence
# Implement Redis storage changes
git push origin feature/oauth-redis-persistence
```

#### Preview Deployment Triggers
- **Automatic**: Push to `feature/oauth-redis-persistence` → GitHub Actions deploy to Vercel Preview
- **URL Pattern**: `https://industrial-mcp-git-feature-oauth-redis-intecrel.vercel.app`
- **Testing**: GitHub Actions runs automated tests against preview URL

### Validation Checklist
- [ ] OAuth discovery endpoints work
- [ ] Client registration persists in Redis
- [ ] Authorization codes survive serverless restarts
- [ ] Claude.ai can complete full MCP connection
- [ ] No -32000 errors on tool access
- [ ] Performance benchmarks acceptable
- [ ] Graceful fallback to in-memory works
- [ ] Redis connection health monitoring

### Production Readiness Gates
- [ ] All preview tests pass
- [ ] Performance within acceptable range
- [ ] No memory leaks or connection issues
- [ ] Claude.ai integration fully functional
- [ ] Rollback plan tested and documented

## Key Benefits
- **Zero production risk**: Full testing in preview environment
- **CI/CD integration**: Leverages existing GitHub Actions workflow  
- **Environment isolation**: Separate Redis instances for preview/prod
- **Rollback safety**: Can toggle Redis on/off via environment variables
- **Stakeholder validation**: Preview URL for testing before production

## Expected Outcome
✅ OAuth flows persist across serverless restarts
✅ Claude.ai MCP connections succeed without -32000 errors
✅ Production-ready authentication infrastructure
✅ Seamless deployment through existing CI/CD pipeline

## Implementation Todo List
1. Setup Upstash Redis for preview environment
2. Install Redis dependencies and create storage abstraction layer
3. Update OAuth client management to use Redis storage
4. Add environment detection and graceful fallback
5. Create feature branch and implement changes
6. Test OAuth persistence in preview deployment