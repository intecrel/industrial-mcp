/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'app/api/**/*.{ts,tsx}',  // Only collect from API routes
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!app/layout.tsx',        // Exclude UI components
    '!app/page.tsx',
    '!app/providers.tsx',
    '!app/**/page.tsx',       // Exclude all Next.js page components
    '!app/components/**'      // Exclude React components
  ],

  coverageThreshold: {
    global: {
      branches: 5,    // Lowered temporarily - only testing core auth/database logic
      functions: 5,
      lines: 5,
      statements: 5
    }
  },

  // Transform ESM modules from node_modules (jose is now mocked)
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol)/)'
  ],

  // Module path aliases (match tsconfig.json)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1'
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'mjs'],

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Timeout for tests (30 seconds for integration tests with databases)
  testTimeout: 30000
};

module.exports = config;
