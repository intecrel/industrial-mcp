# Industrial MCP Test Suite

## Overview

This test suite provides **MCP-focused authentication testing** for the Industrial MCP application, covering the OAuth 2.1 + Auth0 authentication flows used by 5 production Claude.ai custom connector users.

## Test Coverage

### Authentication Tests (`__tests__/auth/`)
- ✅ OAuth 2.1 Bearer token authentication (15 tests)
- ✅ Access token validation and expiration
- ✅ Scope-based permission checking
- ✅ Authentication method detection
- ✅ Multi-scope parsing

### API Endpoint Tests (`__tests__/api/`)
- ✅ MCP endpoint authentication requirements (12 tests)
- ✅ All 18 MCP tools availability
- ✅ CORS preflight handling
- ✅ Tool permission enforcement
- ✅ JSON-RPC 2.0 protocol compliance

### Database Connection Tests (`__tests__/database/`)
- ✅ Neo4j knowledge graph connectivity (13 tests)
- ✅ MySQL/Cloud SQL Matomo analytics connectivity (15 tests)
- ✅ Connection pooling and session management
- ✅ Query execution and error handling
- ✅ Transaction support

**Total: 30 tests** (focused on OAuth + database connectivity used by production MCP tools)

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Test Coverage Report
```bash
npm run test:coverage
```

### Category-Specific Tests
```bash
# Authentication tests only
npm run test:auth

# API endpoint tests only
npm run test:api

# Database connection tests only
npm run test:database
```

## Test Architecture

### Mocking Strategy
- **Neo4j Driver**: Mocked to avoid requiring live database in tests
- **MySQL/Cloud SQL**: Mocked connection pool and queries
- **OAuth JWT**: Mocked token validation
- **Upstash Redis**: Mocked for OAuth state management

### Environment Variables
Test environment variables are configured in `jest.setup.js`:
- `NODE_ENV=test`
- Mock database credentials
- Mock OAuth secrets
- Mock Redis configuration

### Test Utilities
Global test utilities available in all tests:
```javascript
global.testUtils = {
  createMockBearerToken: () => 'Bearer mock-access-token-123',
  createMockApiKey: () => 'test-api-key-12345',
  createMockMacAddress: () => '00:11:22:33:44:55'
};
```

## What's NOT Tested (Intentionally)

Based on production usage analysis, the following are **not covered** in this focused test suite:

❌ **MAC Address Authentication** (0% production usage - deprecated)
- Not used by any of the 5 production Claude.ai users
- Planned for removal in authentication consolidation

❌ **API Key Authentication** (0% production usage - redundant)
- OAuth Bearer tokens are the standard for Claude.ai connectors
- API keys may be kept for internal tools (TBD)

❌ **Auth0 Web UI Flows** (minimal production usage)
- Main website has minimal user functionality
- Focus is on MCP API authentication

❌ **Full Website E2E Tests**
- Production usage is primarily MCP tools via Claude.ai
- Website testing can be added if user base grows

## Integration with CI/CD

Tests run automatically in GitHub Actions:
- ✅ On every PR to `main` or `develop`
- ✅ Before preview deployments
- ✅ Before production deployments

CI/CD workflow (`.github/workflows/ci.yml`) includes:
```yaml
- name: Run authentication tests
  run: npm run test:auth

- name: Run API tests
  run: npm run test:api

- name: Run database tests
  run: npm run test:database
```

## Test Maintenance

### When to Update Tests

1. **Adding New MCP Tools**: Update `__tests__/api/mcp-endpoint.test.ts` to verify new tool is listed
2. **Changing Authentication**: Update `__tests__/auth/oauth-authentication.test.ts`
3. **Database Schema Changes**: Update relevant database connection tests
4. **New OAuth Scopes**: Update scope parsing and permission tests

### Coverage Goals

Current baseline: **0%** (no tests existed)
Target after Phase 1: **80%** coverage for:
- OAuth authentication flows
- MCP endpoint authentication
- Database connectivity

## Troubleshooting

### Tests Failing Locally

1. **Install dependencies**: `npm ci`
2. **Clear Jest cache**: `npx jest --clearCache`
3. **Check Node version**: Must be >= 18.0.0

### Mock Errors

If you see "Cannot find module" errors:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Database Connection Tests Failing

These tests use mocks, so they should not require live databases. If failing:
1. Check that mocks are properly configured in `jest.config.js`
2. Verify `jest.setup.js` is loading correctly
3. Ensure environment variables are set in test environment

## Future Test Additions

After authentication consolidation (removing MAC address auth):

1. **OAuth Refresh Token Flow Tests** (2-3 tests)
2. **Token Revocation Tests** (2-3 tests)
3. **Rate Limiting Tests** (3-5 tests)
4. **MCP Tool Integration Tests** (15-20 tests - one per tool)
5. **Performance Tests** (5-10 tests for connection pooling, query caching)

**Estimated Total**: 85 comprehensive tests (Phase 1 complete = 30 tests, Phase 2 would add 55 more)

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Next.js Applications](https://nextjs.org/docs/testing)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11)
