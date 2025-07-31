'use client'

import { useState, useEffect } from 'react'

interface MCPConnectionInfoProps {
  className?: string
}

export default function MCPConnectionInfo({ className = '' }: MCPConnectionInfoProps) {
  const [mcpUrl, setMcpUrl] = useState('')
  const [industrialMcpUrl, setIndustrialMcpUrl] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    // Set URLs after component mounts (client-side only)
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin
      setMcpUrl(`${baseUrl}/api/mcp`)
      setIndustrialMcpUrl(`${baseUrl}/api/industrial-mcp`)
    }
  }, [])

  const handleCopy = async (url: string, type: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy URL:', err)
    }
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      <h2 className="text-xl font-semibold mb-4 text-gray-900">MCP Integration</h2>
      <p className="text-gray-600 mb-6">
        Use these endpoints to connect Claude Desktop or other AI clients to your industrial MCP server.
      </p>
      
      {/* Primary MCP Endpoint */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-gray-900">Primary MCP Endpoint</h3>
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
            Recommended
          </span>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <code className="text-sm text-gray-800 block mb-3 break-all">
            {mcpUrl || 'Loading...'}
          </code>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleCopy(mcpUrl, 'primary')}
              disabled={!mcpUrl}
              className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {copied === 'primary' ? (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                  Copy URL
                </>
              )}
            </button>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          <strong>Features:</strong> Echo, System Status, Operational Data, Equipment Monitoring
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-3">Claude Desktop Setup Instructions</h4>
        <div className="space-y-4">
          <div>
            <h5 className="font-medium text-blue-900 mb-2">1. Open Claude Desktop Settings</h5>
            <p className="text-sm text-blue-800 mb-1">Click the gear icon (⚙️) in Claude Desktop → Settings</p>
          </div>
          
          <div>
            <h5 className="font-medium text-blue-900 mb-2">2. Create MCP Bridge Script</h5>
            <p className="text-sm text-blue-800 mb-2">Create a bridge script on your Windows machine:</p>
            <div className="text-xs text-blue-700 mb-2">
              Create file: <code>industrial-mcp-bridge.js</code>
            </div>
            <div className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono overflow-x-auto">
              <pre>{`const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// Import fetch - works for Node.js 18+ or with node-fetch
const fetch = require('node-fetch').default || require('node-fetch') || globalThis.fetch;

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
    
    const response = await fetch('${mcpUrl || 'http://localhost:3001/api/mcp'}', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'application/json, text/event-stream',
        'Connection': 'keep-alive'
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
    const lines = data.split('\\n');
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
    
    const response = await fetch('${mcpUrl || 'http://localhost:3001/api/mcp'}', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'application/json, text/event-stream',
        'Connection': 'keep-alive'
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
    const lines = data.split('\\n');
    const dataLine = lines.find(line => line.startsWith('data: '));
    if (dataLine) {
      const jsonData = JSON.parse(dataLine.substring(6));
      return jsonData.result;
    }
    return { content: [{ type: 'text', text: 'Error: No response data' }] };
  } catch (error) {
    console.error('Error calling tool:', error);
    return { content: [{ type: 'text', text: \`Error: \${error.message}\` }] };
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

main().catch(console.error);`}</pre>
            </div>
          </div>

          <div>
            <h5 className="font-medium text-blue-900 mb-2">3. Install Dependencies</h5>
            <p className="text-sm text-blue-800 mb-2">On your Windows machine:</p>
            <div className="bg-gray-900 text-green-400 p-2 rounded text-xs font-mono mb-2">
              npm install @modelcontextprotocol/sdk node-fetch
            </div>
            <p className="text-xs text-blue-700 mt-1">Note: For Node.js 18+, you can use built-in fetch or node-fetch</p>
          </div>

          <div>
            <h5 className="font-medium text-blue-900 mb-2">4. Configure Claude Desktop</h5>
            <p className="text-sm text-blue-800 mb-2">Edit your Claude Desktop config file:</p>
            <div className="text-xs text-blue-700 mb-2">
              <strong>Config file location:</strong>
              <br />• Windows: <code>C:\\Users\\YourUsername\\AppData\\Roaming\\Claude\\claude_desktop_config.json</code>
              <br />• Mac: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
            </div>
            <div className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono overflow-x-auto">
              <pre>{`{
  "mcpServers": {
    "industrial-mcp": {
      "command": "node",
      "args": ["C:\\\\path\\\\to\\\\industrial-mcp-bridge.js"]
    }
  }
}`}</pre>
            </div>
          </div>

          <div>
            <h5 className="font-medium text-blue-900 mb-2">5. Restart Claude Desktop</h5>
            <p className="text-sm text-blue-800">Close and reopen Claude Desktop to load the new MCP server</p>
          </div>

          <div>
            <h5 className="font-medium text-blue-900 mb-2">6. Verify Connection</h5>
            <p className="text-sm text-blue-800">Start a new chat and ask: <em>"What industrial tools do you have access to?"</em></p>
            <p className="text-xs text-blue-700 mt-1">You should see an MCP indicator in the bottom-right of the input box</p>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
          <p className="text-xs text-amber-800">
            <strong>Note:</strong> Make sure your Industrial MCP server is running on http://localhost:3001 
            before configuring Claude Desktop.
          </p>
        </div>
      </div>
    </div>
  )
}