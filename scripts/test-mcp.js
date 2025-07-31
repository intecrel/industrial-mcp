#!/usr/bin/env node
/**
 * Industrial MCP Test Script
 * --------------------------
 * Tests all MCP endpoints, authentication, and Neo4j connectivity.
 * Can be run against both local and production deployments.
 * 
 * Usage:
 *   node test-mcp.js --url=http://localhost:3000 --api-key=your-api-key --mac=84:94:37:e4:24:88
 *   node test-mcp.js --url=https://your-deployment.vercel.app --api-key=your-api-key --mac=84:94:37:e4:24:88
 */

// Use built-in fetch for Node.js 18+ or fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch').default || require('node-fetch');
const { URLSearchParams } = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key && value) {
    acc[key.replace(/^--/, '')] = value;
  }
  return acc;
}, {});

// Configuration
const config = {
  url: args.url || 'http://localhost:3000',
  apiKey: args.apiKey || process.env.MCP_API_KEY,
  macAddress: args.mac || '84:94:37:e4:24:88',
  cookieJar: {},
  verbose: args.verbose === 'true' || false
};

// Sample Cypher queries for testing
const SAMPLE_QUERIES = [
  {
    name: 'Get Schema',
    query: '_GET_SCHEMA',
    params: {}
  },
  {
    name: 'Count All Nodes',
    query: 'MATCH (n) RETURN count(n) AS nodeCount',
    params: {}
  },
  {
    name: 'Find Workers with Skills',
    query: 'MATCH (w:Worker)-[:REQUIRES_SKILL]->(s:Skill) RETURN w.name, collect(s.name) AS skills LIMIT 5',
    params: {}
  },
  {
    name: 'Department Structure',
    query: 'MATCH (d:Department)<-[:BELONGS_TO]-(w:Worker) RETURN d.name, count(w) AS workerCount ORDER BY workerCount DESC LIMIT 3',
    params: {}
  },
  {
    name: 'Capability Network',
    query: 'MATCH (c:Capability)-[r]-(related) RETURN c.name, type(r), labels(related)[0], related.name LIMIT 10',
    params: {}
  }
];

// Console colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m'
};

// Helper functions
function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️ ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠️ ${message}`, colors.yellow);
}

function logHeader(message) {
  console.log('\n' + colors.bright + colors.cyan + '━'.repeat(message.length + 4) + colors.reset);
  console.log(colors.bright + colors.cyan + `┃ ${message} ┃` + colors.reset);
  console.log(colors.bright + colors.cyan + '━'.repeat(message.length + 4) + colors.reset);
}

function logVerbose(message) {
  if (config.verbose) {
    log(`🔍 ${message}`, colors.dim);
  }
}

// Store cookies from response
function saveCookies(response) {
  const cookies = response.headers.raw()['set-cookie'];
  if (cookies) {
    cookies.forEach(cookie => {
      const [nameValue] = cookie.split(';');
      const [name, value] = nameValue.split('=');
      config.cookieJar[name] = value;
    });
  }
}

// Format cookies for request
function getCookieHeader() {
  return Object.entries(config.cookieJar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

// Make HTTP request with proper headers
async function makeRequest(endpoint, options = {}) {
  const url = `${config.url}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(config.apiKey && { 'x-api-key': config.apiKey }),
    ...(Object.keys(config.cookieJar).length > 0 && { 'Cookie': getCookieHeader() }),
    ...options.headers
  };

  const requestOptions = {
    method: options.method || 'GET',
    headers,
    ...(options.body && { body: JSON.stringify(options.body) })
  };

  logVerbose(`${requestOptions.method} ${url}`);
  if (options.body) {
    logVerbose(`Request body: ${JSON.stringify(options.body, null, 2)}`);
  }

  try {
    const response = await fetch(url, requestOptions);
    saveCookies(response);

    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    logVerbose(`Response status: ${response.status}`);
    logVerbose(`Response data: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`);

    return {
      status: response.status,
      data,
      headers: response.headers,
      ok: response.ok
    };
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    throw error;
  }
}

// Test functions
async function testVerificationStatus() {
  logHeader('Testing Verification Status');
  
  try {
    const response = await makeRequest('/api/verify/status');
    
    if (response.status === 200) {
      const { verified } = response.data;
      if (verified) {
        logWarning('Already verified. This might affect test results.');
      } else {
        logSuccess('Verification status endpoint working correctly.');
      }
      return true;
    } else {
      logError(`Verification status check failed with status ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Verification status check failed: ${error.message}`);
    return false;
  }
}

async function testMacAddressVerification() {
  logHeader('Testing MAC Address Verification');
  
  try {
    const response = await makeRequest('/api/verify', {
      method: 'POST',
      body: { macAddress: config.macAddress }
    });
    
    if (response.status === 200 && response.data.success) {
      logSuccess('MAC address verification successful.');
      return true;
    } else {
      logError(`MAC address verification failed: ${response.data.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    logError(`MAC address verification failed: ${error.message}`);
    return false;
  }
}

async function testVerificationStatusAfterAuth() {
  logHeader('Testing Verification Status After Authentication');
  
  try {
    const response = await makeRequest('/api/verify/status');
    
    if (response.status === 200 && response.data.verified) {
      logSuccess('Successfully verified! Cookie authentication working.');
      return true;
    } else {
      logError('Verification failed after MAC address verification.');
      return false;
    }
  } catch (error) {
    logError(`Verification status check failed: ${error.message}`);
    return false;
  }
}

async function testMcpInfoEndpoint() {
  logHeader('Testing MCP Info Endpoint');
  
  if (!config.apiKey) {
    logWarning('API key not provided. Skipping MCP endpoint tests.');
    return false;
  }
  
  try {
    const response = await makeRequest('/api/mcp');
    
    if (response.status === 200 && response.data.mcp?.status === 'success') {
      logSuccess('MCP info endpoint working correctly.');
      logInfo(`MCP Version: ${response.data.mcp.version}`);
      
      // Display some info about the resources if available
      if (response.data.data?.resources?.entityTypes) {
        logInfo(`Available entity types: ${response.data.data.resources.entityTypes.join(', ')}`);
      }
      
      return true;
    } else if (response.status === 401) {
      logError('MCP info endpoint authentication failed. Check your API key.');
      return false;
    } else {
      logError(`MCP info endpoint failed: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    logError(`MCP info endpoint test failed: ${error.message}`);
    return false;
  }
}

async function testMcpQueryEndpoint() {
  logHeader('Testing MCP Query Endpoint');
  
  if (!config.apiKey) {
    logWarning('API key not provided. Skipping MCP query tests.');
    return false;
  }
  
  let allQueriesSuccessful = true;
  
  for (const [index, queryInfo] of SAMPLE_QUERIES.entries()) {
    log(`\nRunning query ${index + 1}/${SAMPLE_QUERIES.length}: ${queryInfo.name}`, colors.cyan);
    log(`Query: ${queryInfo.query}`, colors.dim);
    
    try {
      const response = await makeRequest('/api/mcp', {
        method: 'POST',
        body: {
          query: queryInfo.query,
          params: queryInfo.params
        }
      });
      
      if (response.status === 200 && response.data.mcp?.status === 'success') {
        logSuccess(`Query "${queryInfo.name}" executed successfully.`);
        
        // Show result summary
        if (response.data.data?.results) {
          const resultCount = response.data.data.count || response.data.data.results.length;
          logInfo(`Results: ${resultCount} records`);
          
          // Show a sample of the results if available
          if (resultCount > 0 && config.verbose) {
            const sample = response.data.data.results.slice(0, 2);
            log('Sample results:', colors.dim);
            console.log(JSON.stringify(sample, null, 2));
          }
        }
      } else {
        logError(`Query "${queryInfo.name}" failed: ${JSON.stringify(response.data)}`);
        allQueriesSuccessful = false;
      }
    } catch (error) {
      logError(`Query "${queryInfo.name}" failed: ${error.message}`);
      allQueriesSuccessful = false;
    }
  }
  
  return allQueriesSuccessful;
}

async function testLogout() {
  logHeader('Testing Logout');
  
  try {
    const response = await makeRequest('/api/logout', {
      method: 'POST'
    });
    
    if (response.status === 200 && response.data.success) {
      logSuccess('Logout successful.');
      
      // Verify we're logged out
      const verifyResponse = await makeRequest('/api/verify/status');
      if (verifyResponse.status === 200 && !verifyResponse.data.verified) {
        logSuccess('Verification status correctly shows as not verified after logout.');
        return true;
      } else {
        logError('Still verified after logout. Logout may not be working correctly.');
        return false;
      }
    } else {
      logError(`Logout failed: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    logError(`Logout test failed: ${error.message}`);
    return false;
  }
}

// Main test function
async function runTests() {
  console.clear();
  logHeader('INDUSTRIAL MCP TEST SCRIPT');
  log(`Target URL: ${config.url}`, colors.yellow);
  log(`MAC Address: ${config.macAddress}`, colors.yellow);
  log(`API Key: ${config.apiKey ? '********' + config.apiKey.slice(-4) : 'Not provided'}`, colors.yellow);
  log(`Verbose Mode: ${config.verbose ? 'Enabled' : 'Disabled'}`, colors.yellow);
  
  // Check arguments
  if (!config.url) {
    logError('URL is required. Use --url=http://localhost:3000');
    return;
  }
  
  if (!config.apiKey) {
    logWarning('API key not provided. Some tests will be skipped.');
  }
  
  // Run tests
  const results = {
    verificationStatus: await testVerificationStatus(),
    macVerification: await testMacAddressVerification(),
    verificationAfterAuth: await testVerificationStatusAfterAuth(),
    mcpInfo: await testMcpInfoEndpoint(),
    mcpQuery: await testMcpQueryEndpoint(),
    logout: await testLogout()
  };
  
  // Summary
  logHeader('TEST RESULTS SUMMARY');
  
  Object.entries(results).forEach(([test, passed]) => {
    const testName = test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    if (passed) {
      logSuccess(`${testName}: Passed`);
    } else {
      logError(`${testName}: Failed`);
    }
  });
  
  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.values(results).length;
  const passRate = Math.round((passedCount / totalCount) * 100);
  
  console.log('\n');
  if (passedCount === totalCount) {
    log(`${colors.bgGreen}${colors.bright} All tests passed! ${passRate}% success rate. ${colors.reset}`);
  } else {
    log(`${colors.bgRed}${colors.bright} ${passedCount}/${totalCount} tests passed. ${passRate}% success rate. ${colors.reset}`);
  }
  
  // Recommendations
  if (passedCount < totalCount) {
    logHeader('RECOMMENDATIONS');
    
    if (!results.verificationStatus || !results.verificationAfterAuth) {
      logInfo('Check that your server is running and the verification endpoints are working correctly.');
    }
    
    if (!results.macVerification) {
      logInfo(`Verify that the MAC address "${config.macAddress}" is correctly configured in your environment variables.`);
    }
    
    if (!results.mcpInfo || !results.mcpQuery) {
      logInfo('Check your API key and make sure the MCP endpoints are properly implemented.');
      logInfo('Verify that your Neo4j connection is working if queries are failing.');
    }
    
    if (!results.logout) {
      logInfo('Check that the logout endpoint is properly clearing cookies.');
    }
  }
}

// Run the tests
runTests().catch(error => {
  logError(`Test script failed: ${error.message}`);
  process.exit(1);
});
