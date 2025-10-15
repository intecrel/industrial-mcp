/**
 * Jest Setup File
 * Runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// Mock environment variables for testing
process.env.NEO4J_URI = 'neo4j+s://test.databases.neo4j.io';
process.env.NEO4J_USERNAME = 'test-user';
process.env.NEO4J_PASSWORD = 'test-password';

process.env.CLOUD_SQL_CONNECTION_NAME = 'test-project:test-region:test-instance';
process.env.CLOUD_SQL_DATABASE_NAME = 'test_matomo';
process.env.CLOUD_SQL_USERNAME = 'test-user';
process.env.CLOUD_SQL_PASSWORD = 'test-password';

process.env.API_KEY = 'test-api-key-12345';
process.env.OAUTH_ENABLED = 'true';
process.env.OAUTH_JWT_SECRET = 'test-jwt-secret-key-for-testing';

// Mock Redis for OAuth state management
process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-redis-token';

// Mock jose library (pure ESM module)
jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setIssuer: jest.fn().mockReturnThis(),
    setAudience: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    setSubject: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue('mock.jwt.token')
  })),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      iss: 'https://industrial-mcp.vercel.app',
      sub: 'claude-connector-user-1',
      aud: 'https://industrial-mcp.vercel.app',
      client_id: 'claude-connector-user-1',
      scope: 'mcp:read mcp:write',
      token_type: 'access_token',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000)
    },
    protectedHeader: { alg: 'HS256', typ: 'JWT' }
  }),
  importJWK: jest.fn().mockResolvedValue({}),
  exportJWK: jest.fn().mockResolvedValue({}),
  generateSecret: jest.fn().mockResolvedValue({})
}));

// Suppress console.log during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

// Setup global test utilities
global.testUtils = {
  createMockBearerToken: () => 'Bearer mock-access-token-123',
  createMockApiKey: () => 'test-api-key-12345',
  createMockMacAddress: () => '00:11:22:33:44:55'
};
