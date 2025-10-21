#!/usr/bin/env node

/**
 * Comprehensive Remote MCP Server Test Suite
 * Tests all authentication methods, transports, and integrations
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const CONFIG = {
  SERVER_URL: process.env.TEST_SERVER_URL || 'http://localhost:3000',
  API_KEY: process.env.API_KEY,
  VERBOSE: process.env.VERBOSE === 'true' || process.argv.includes('--verbose')
};

// Validate required environment variables
if (!CONFIG.API_KEY) {
  console.error('❌ Missing required environment variable: API_KEY');
  console.error('   Please set API_KEY in your environment or .env file');
  process.exit(1);
}

// Test utilities
const log = (message) => console.log(`🧪 ${message}`);
const success = (message) => console.log(`✅ ${message}`);
const error = (message) => console.log(`❌ ${message}`);
const info = (message) => CONFIG.VERBOSE && console.log(`ℹ️  ${message}`);

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = res.headers['content-type']?.includes('application/json') 
            ? JSON.parse(data) 
            : data;
          resolve({ status: res.statusCode, data: jsonData, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: data, error: e.message });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// Test cases
const tests = [
  // Basic connectivity tests
  {
    name: "Health Check",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/health`);
      return response.status === 200 && response.data.status === 'healthy';
    }
  },

  // OAuth endpoint tests
  {
    name: "OAuth Metadata Endpoint",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/.well-known/oauth-authorization-server`);
      return response.status === 200 && response.data.issuer;
    }
  },

  {
    name: "OAuth Client Registration", 
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          client_name: 'Test Client',
          redirect_uris: ['http://localhost:8080/callback'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          scope: 'read:analytics'
        }
      });
      return response.status === 200 && response.data.client_id;
    }
  },

  // Transport endpoint tests
  {
    name: "Multi-Transport Configuration",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/transport/config`);
      return response.status === 200 && response.data.transports;
    }
  },

  {
    name: "Stdio Transport Endpoint",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/stdio`);
      return response.status === 200 && response.data.transport === 'stdio';
    }
  },

  {
    name: "SSE Transport Endpoint Info",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/sse`, {
        method: 'OPTIONS'
      });
      return response.status === 200;
    }
  },

  // Integration endpoint tests
  {
    name: "Claude.ai Configuration",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/claude/config`);
      return response.status === 200 && response.data.oauth;
    }
  },

  {
    name: "Claude Desktop Configuration",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/claude-desktop/config`);
      return response.status === 200 && response.data.mcpServers;
    }
  },

  {
    name: "Claude.ai Connection Test",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/claude/test`);
      return response.status === 200 && response.data.success;
    }
  },

  // API Key Authentication tests
  {
    name: "API Key Authentication (MCP Tools List)",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'x-api-key': CONFIG.API_KEY
        },
        body: {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/list'
        }
      });

      // Handle SSE response
      if (response.raw && response.raw.includes('event: message')) {
        const dataLine = response.raw.split('\n').find(line => line.startsWith('data: '));
        if (dataLine) {
          const jsonData = JSON.parse(dataLine.substring(6));
          return jsonData.result && jsonData.result.tools;
        }
      }
      return response.status === 200 && response.data?.result?.tools;
    }
  },

  {
    name: "API Key Authentication (Echo Tool)",
    test: async () => {
      const response = await makeRequest(`${CONFIG.SERVER_URL}/api/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'x-api-key': CONFIG.API_KEY
        },
        body: {
          jsonrpc: '2.0',
          id: '2',
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'Remote MCP Test' }
          }
        }
      });

      // Handle SSE response
      if (response.raw && response.raw.includes('event: message')) {
        const dataLine = response.raw.split('\n').find(line => line.startsWith('data: '));
        if (dataLine) {
          const jsonData = JSON.parse(dataLine.substring(6));
          return jsonData.result?.content?.[0]?.text?.includes('Remote MCP Test');
        }
      }
      return response.status === 200 && response.data?.result?.content?.[0]?.text?.includes('Remote MCP Test');
    }
  }
];

// Run tests
async function runTests() {
  console.log('🚀 Starting Remote MCP Server Test Suite\n');
  console.log(`Server: ${CONFIG.SERVER_URL}`);
  console.log(`API Key: ${CONFIG.API_KEY ? CONFIG.API_KEY.substring(0, 8) + '***' : 'NOT_SET'}\n`);

  let passed = 0;
  let failed = 0;

  for (const testCase of tests) {
    try {
      log(`Testing: ${testCase.name}`);
      const result = await testCase.test();
      
      if (result) {
        success(`PASSED: ${testCase.name}`);
        passed++;
      } else {
        error(`FAILED: ${testCase.name}`);
        failed++;
      }
    } catch (err) {
      error(`ERROR: ${testCase.name} - ${err.message}`);
      failed++;
      if (CONFIG.VERBOSE) {
        console.error(err);
      }
    }
    console.log(''); // Add spacing between tests
  }

  // Summary
  console.log('📊 Test Results Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Remote MCP Server is ready for deployment.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review before deployment.');
  }

  process.exit(failed === 0 ? 0 : 1);
}

// Start testing
runTests().catch(console.error);