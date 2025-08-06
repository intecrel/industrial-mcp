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

// Sample MCP tool calls for testing
const SAMPLE_TOOL_CALLS = [
  {
    name: 'Knowledge Graph Stats',
    tool: 'get_knowledge_graph_stats',
    args: {}
  },
  {
    name: 'Organizational Structure',
    tool: 'get_organizational_structure',
    args: { depth: 2 }
  },
  {
    name: 'Query Knowledge Graph - Count Nodes',
    tool: 'query_knowledge_graph',
    args: { 
      query: 'MATCH (n) RETURN count(n) AS nodeCount',
      limit: 10
    }
  },
  {
    name: 'Query Knowledge Graph - Companies',
    tool: 'query_knowledge_graph',
    args: { 
      query: 'MATCH (c:Company) RETURN c.name, c.industry LIMIT 5',
      limit: 10
    }
  },
  {
    name: 'Database Status',
    tool: 'get_cloud_sql_status',
    args: { include_details: true }
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

// Parse SSE response format
function parseSSEResponse(sseText) {
  try {
    // SSE format: "event: message\ndata: {...}\n\n"
    const lines = sseText.split('\n');
    let dataLine = null;
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLine = line.substring(6); // Remove 'data: ' prefix
        break;
      }
    }
    
    if (dataLine) {
      return JSON.parse(dataLine);
    }
    
    // Fallback: try to parse as JSON directly
    return JSON.parse(sseText);
  } catch (error) {
    logVerbose(`Failed to parse SSE response: ${error.message}`);
    return null;
  }
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
  // Use native fetch headers API instead of node-fetch raw()
  const cookies = response.headers.get('set-cookie');
  if (cookies) {
    // Handle multiple cookies (native fetch concatenates them with ', ')
    const cookieList = cookies.includes(', ') ? cookies.split(', ') : [cookies];
    cookieList.forEach(cookie => {
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
      const textData = await response.text();
      
      // Try to parse as SSE if it looks like SSE format
      if (textData.includes('event:') && textData.includes('data:')) {
        const parsedSSE = parseSSEResponse(textData);
        data = parsedSSE || textData;
      } else {
        data = textData;
      }
    }

    logVerbose(`Response status: ${response.status}`);
    logVerbose(`Response data: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : (typeof data === 'string' ? data.substring(0, 200) + '...' : data)}`);

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
    const response = await makeRequest('/api/mcp', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream'
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      }
    });
    
    if (response.status === 200 && response.data.result?.tools) {
      logSuccess('MCP info endpoint working correctly.');
      logInfo(`Available tools: ${response.data.result.tools.length}`);
      
      // Display some tool names
      const toolNames = response.data.result.tools.slice(0, 3).map(t => t.name);
      if (toolNames.length > 0) {
        logInfo(`Sample tools: ${toolNames.join(', ')}`);
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
  logHeader('Testing MCP Tool Calls');
  
  if (!config.apiKey) {
    logWarning('API key not provided. Skipping MCP tool tests.');
    return false;
  }
  
  let allToolsSuccessful = true;
  
  for (const [index, toolCall] of SAMPLE_TOOL_CALLS.entries()) {
    log(`\nRunning tool ${index + 1}/${SAMPLE_TOOL_CALLS.length}: ${toolCall.name}`, colors.cyan);
    log(`Tool: ${toolCall.tool}`, colors.dim);
    
    try {
      const response = await makeRequest('/api/mcp', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/event-stream'
        },
        body: {
          jsonrpc: '2.0',
          id: index + 2,
          method: 'tools/call',
          params: {
            name: toolCall.tool,
            arguments: toolCall.args
          }
        }
      });
      
      if (response.status === 200 && response.data.result) {
        logSuccess(`Tool "${toolCall.name}" executed successfully.`);
        
        // Show result summary
        if (response.data.result.content) {
          const content = response.data.result.content[0];
          if (content?.text) {
            try {
              const result = JSON.parse(content.text);
              if (result.success !== false) {
                logInfo(`Tool executed with success`);
                if (config.verbose) {
                  log(`Result: ${content.text.substring(0, 200)}...`, colors.dim);
                }
              } else {
                logWarning(`Tool returned error: ${result.error || 'Unknown error'}`);
              }
            } catch {
              logInfo(`Tool returned text result`);
              if (config.verbose) {
                log(`Result: ${content.text.substring(0, 200)}...`, colors.dim);
              }
            }
          }
        }
      } else {
        logError(`Tool "${toolCall.name}" failed: ${JSON.stringify(response.data)}`);
        allToolsSuccessful = false;
      }
    } catch (error) {
      logError(`Tool "${toolCall.name}" failed: ${error.message}`);
      allToolsSuccessful = false;
    }
  }
  
  return allToolsSuccessful;
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
