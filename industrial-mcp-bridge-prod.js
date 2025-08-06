const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

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

// Forward tools/list to HTTP MCP server using schema
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch('https://industrial-mcp-delta.vercel.app/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Connection': 'keep-alive',
        'x-api-key': 'imcp-prod-2024-a7f3d8e9c2b1f4a6d5e8c3f7b2a9d4e6f1c8b5a2e9d7f3c6b4a1e8d5f2c9a6b3',
        'x-mac-address': '00:15:5d:77:c8:ae'
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

    const response = await fetch('https://industrial-mcp-delta.vercel.app/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Connection': 'keep-alive',
        'x-api-key': 'imcp-prod-2024-a7f3d8e9c2b1f4a6d5e8c3f7b2a9d4e6f1c8b5a2e9d7f3c6b4a1e8d5f2c9a6b3',
        'x-mac-address': '00:15:5d:77:c8:ae'
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