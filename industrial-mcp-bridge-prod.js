const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// Configuration - Use environment variables for security
const CONFIG = {
  MCP_SERVER_URL: process.env.MCP_SERVER_URL || 'http://localhost:3000/api/mcp',
  API_KEY: process.env.MCP_API_KEY || 'your-api-key-here',
  MAC_ADDRESS: process.env.MCP_MAC_ADDRESS || 'your-mac-address',
  OAUTH_TOKEN: process.env.MCP_OAUTH_TOKEN, // OAuth Bearer token support
  DEBUG: process.env.DEBUG === 'true'
};

// Use native fetch for Node.js 18+ or fallback to global
const fetch = globalThis.fetch;

const server = new Server({
  name: 'industrial-mcp-bridge',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {},
    resources: {},
    prompts: {}
  }
});

// Get authentication headers based on available configuration
function getAuthHeaders() {
  if (CONFIG.OAUTH_TOKEN) {
    // Use OAuth Bearer token if available
    return {
      'Authorization': `Bearer ${CONFIG.OAUTH_TOKEN}`
    };
  } else {
    // Fall back to API key + MAC address
    return {
      'x-api-key': CONFIG.API_KEY,
      'x-mac-address': CONFIG.MAC_ADDRESS
    };
  }
}

// Forward tools/list to HTTP MCP server using schema
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(CONFIG.MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Connection': 'keep-alive',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: request.id || 1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.text();
    const lines = data.split('\n');
    const dataLine = lines.find(line => line.startsWith('data: '));
    if (dataLine) {
      const jsonData = JSON.parse(dataLine.substring(6));
      return jsonData.result;
    }
    return { tools: [] };
  } catch (error) {
    console.error('Error fetching tools:', error);
    return { tools: [] };
  }
});

// Forward tools/call to HTTP MCP server using schema
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout for tool calls

    const response = await fetch(CONFIG.MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Connection': 'keep-alive',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: request.id || 1,
        params: request.params
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.text();
    const lines = data.split('\n');
    const dataLine = lines.find(line => line.startsWith('data: '));
    if (dataLine) {
      const jsonData = JSON.parse(dataLine.substring(6));
      return jsonData.result;
    }
    return { content: [{ type: 'text', text: 'Error: No response data' }] };
  } catch (error) {
    console.error('Error calling tool:', error);
    return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  }
});

// Handle resources/list (return empty to avoid "Method not found")
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

// Handle prompts/list (return empty to avoid "Method not found")
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: [] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);