#!/usr/bin/env node

/**
 * Vercel Preview Deployment Test Script
 * Tests the preview deployment before promoting to production
 */

const fetch = require('node-fetch');

// Configuration
const config = {
  previewUrl: process.env.VERCEL_URL || process.argv[2],
  apiKey: process.env.API_KEY || process.argv[3],
  macAddress: process.env.MAC_ADDRESS || '00:15:5d:77:c8:ae',
  verbose: process.env.VERBOSE === 'true' || process.argv.includes('--verbose')
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  const border = '━'.repeat(title.length + 4);
  log(`${colors.bright}${colors.cyan}${border}`, 'cyan');
  log(`${colors.bright}${colors.cyan}┃ ${title} ┃`, 'cyan');
  log(`${colors.bright}${colors.cyan}${border}`, 'cyan');
}

async function testPreviewDeployment() {
  if (!config.previewUrl) {
    log('❌ Preview URL not provided. Usage: node test-preview.js <preview-url> [api-key]', 'red');
    process.exit(1);
  }

  const baseUrl = config.previewUrl.startsWith('http') 
    ? config.previewUrl 
    : `https://${config.previewUrl}`;

  header('VERCEL PREVIEW DEPLOYMENT TEST');
  log(`Preview URL: ${baseUrl}`, 'yellow');
  log(`API Key: ${config.apiKey ? 'Provided' : 'Not provided'}`, 'yellow');
  log(`Verbose Mode: ${config.verbose ? 'Enabled' : 'Disabled'}`, 'yellow');

  const tests = [];
  let passedTests = 0;

  // Test 1: Basic Health Check
  header('Testing Basic Health Check');
  try {
    const response = await fetch(`${baseUrl}/api/verify/status`);
    const data = await response.json();
    
    if (response.ok && data.status === 'success') {
      log('✅ Health check passed', 'green');
      tests.push({ name: 'Health Check', status: 'passed' });
      passedTests++;
    } else {
      log('❌ Health check failed', 'red');
      tests.push({ name: 'Health Check', status: 'failed' });
    }
    
    if (config.verbose) {
      log(`Response: ${JSON.stringify(data, null, 2)}`, 'blue');
    }
  } catch (error) {
    log(`❌ Health check error: ${error.message}`, 'red');
    tests.push({ name: 'Health Check', status: 'failed' });
  }

  // Test 2: MCP Tools List
  if (config.apiKey) {
    header('Testing MCP Tools List');
    try {
      const response = await fetch(`${baseUrl}/api/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'x-api-key': config.apiKey
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        })
      });

      const text = await response.text();
      
      if (response.ok && text.includes('tools') && text.includes('query_knowledge_graph')) {
        const toolCount = (text.match(/"name":/g) || []).length;
        log(`✅ MCP tools available: ${toolCount}`, 'green');
        tests.push({ name: 'MCP Tools List', status: 'passed' });
        passedTests++;
      } else {
        log('❌ MCP tools list failed', 'red');
        tests.push({ name: 'MCP Tools List', status: 'failed' });
      }
      
      if (config.verbose) {
        log(`Response: ${text.substring(0, 500)}...`, 'blue');
      }
    } catch (error) {
      log(`❌ MCP tools error: ${error.message}`, 'red');
      tests.push({ name: 'MCP Tools List', status: 'failed' });
    }

    // Test 3: Neo4j Knowledge Graph Test
    header('Testing Neo4j Knowledge Graph');
    try {
      const response = await fetch(`${baseUrl}/api/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'x-api-key': config.apiKey
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'get_knowledge_graph_stats',
            arguments: {}
          }
        })
      });

      const text = await response.text();
      
      if (response.ok && text.includes('knowledge_graph_stats') && text.includes('total_relationships')) {
        log('✅ Neo4j knowledge graph accessible', 'green');
        tests.push({ name: 'Neo4j Connection', status: 'passed' });
        passedTests++;
      } else {
        log('❌ Neo4j knowledge graph failed', 'red');
        tests.push({ name: 'Neo4j Connection', status: 'failed' });
      }
    } catch (error) {
      log(`❌ Neo4j test error: ${error.message}`, 'red');
      tests.push({ name: 'Neo4j Connection', status: 'failed' });
    }
  } else {
    log('⚠️ API key not provided. Skipping MCP endpoint tests.', 'yellow');
    tests.push({ name: 'MCP Tools List', status: 'skipped' });
    tests.push({ name: 'Neo4j Connection', status: 'skipped' });
  }

  // Test Results Summary
  header('PREVIEW TEST RESULTS');
  tests.forEach(test => {
    const icon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⚠️';
    const color = test.status === 'passed' ? 'green' : test.status === 'failed' ? 'red' : 'yellow';
    log(`${icon} ${test.name}: ${test.status}`, color);
  });

  const totalTests = tests.filter(t => t.status !== 'skipped').length;
  const successRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  
  log(`\n${colors.bright}${colors.white} ${passedTests}/${totalTests} tests passed. ${successRate}% success rate. ${colors.reset}`);

  // Recommendations
  header('RECOMMENDATIONS');
  if (successRate === 100) {
    log('🎉 All tests passed! Preview deployment is ready for production.', 'green');
    log('✅ You can safely merge this to main branch for production deployment.', 'green');
  } else if (successRate >= 75) {
    log('⚠️ Most tests passed, but some issues detected.', 'yellow');
    log('🔍 Review failed tests before deploying to production.', 'yellow');
  } else {
    log('❌ Critical issues detected in preview deployment.', 'red');
    log('🛠️ Fix issues before promoting to production.', 'red');
  }

  log(`\n📊 Preview URL: ${baseUrl}`, 'cyan');
  log(`🔗 MCP Endpoint: ${baseUrl}/api/mcp`, 'cyan');
  
  process.exit(successRate === 100 ? 0 : 1);
}

// Run tests
testPreviewDeployment().catch(error => {
  log(`❌ Test script error: ${error.message}`, 'red');
  process.exit(1);
});