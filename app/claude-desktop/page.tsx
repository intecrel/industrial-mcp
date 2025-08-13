/**
 * Claude Desktop MCP Integration Page
 * Step-by-step guide for connecting Claude Desktop to Industrial MCP
 */

'use client';

import { useState, useEffect } from 'react';
import { Copy, CheckCircle, Download, ExternalLink, Monitor, Key, Settings } from 'lucide-react';

interface DesktopConfig {
  mcpServers: {
    [key: string]: {
      name: string;
      description: string;
      transport: {
        type: string;
        url: string;
        headers: Record<string, string>;
      };
    };
  };
  setup: {
    authentication: {
      type: string;
      client_id?: string;
      authorization_url?: string;
      token_url?: string;
      headers?: Record<string, string>;
    };
  };
  system: {
    server_url: string;
    mcp_version: string;
    oauth_version: string;
  };
}

export default function ClaudeDesktopPage() {
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [authType, setAuthType] = useState<'oauth' | 'apikey'>('oauth');
  const [copied, setCopied] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [authType]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/claude-desktop/config?auth=${authType}`);
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to load Claude Desktop config:', err);
    }
    setLoading(false);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied({ ...copied, [key]: true });
    setTimeout(() => setCopied({ ...copied, [key]: false }), 2000);
  };

  const downloadConfig = () => {
    if (!config) return;

    const simpleConfig = {
      mcpServers: {
        "industrial-mcp": {
          command: "node",
          args: ["-p", "require('child_process').spawn('curl', ['-X', 'POST', '-H', 'Content-Type: application/json', '-H', 'Authorization: Bearer YOUR_TOKEN', '/api/stdio'], {stdio: 'inherit'})"],
          env: {
            INDUSTRIAL_MCP_URL: config.system.server_url
          }
        }
      }
    };

    const blob = new Blob([JSON.stringify(simpleConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'claude-desktop-mcp-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading Claude Desktop configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Monitor className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">
              Claude Desktop Integration
            </h1>
          </div>
          <p className="text-xl text-muted-foreground">
            Connect Claude Desktop to Industrial MCP Server using native MCP connector support
          </p>
        </div>

        {/* Authentication Method Selection */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Choose Authentication Method</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setAuthType('oauth')}
              className={`p-4 rounded-lg border-2 transition-colors ${
                authType === 'oauth' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Settings className="w-5 h-5" />
                <h3 className="font-medium">OAuth 2.1 (Recommended)</h3>
              </div>
              <p className="text-sm text-muted-foreground text-left">
                Secure token-based authentication with scope-based access control. 
                Best for production use.
              </p>
            </button>

            <button
              onClick={() => setAuthType('apikey')}
              className={`p-4 rounded-lg border-2 transition-colors ${
                authType === 'apikey' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Key className="w-5 h-5" />
                <h3 className="font-medium">API Key + MAC Address</h3>
              </div>
              <p className="text-sm text-muted-foreground text-left">
                Simple authentication using API key and device MAC address. 
                Good for development.
              </p>
            </button>
          </div>
        </div>

        {/* Configuration Steps */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Claude Desktop Configuration</h2>
            <button
              onClick={downloadConfig}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Download className="w-4 h-4" />
              Download Config
            </button>
          </div>

          {/* Step 1: Install Claude Desktop */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                1
              </div>
              <h3 className="text-lg font-medium">Install Claude Desktop</h3>
            </div>
            <div className="ml-11">
              <p className="text-muted-foreground mb-2">
                Download and install Claude Desktop from Anthropic if you haven't already.
              </p>
              <a
                href="https://claude.ai/desktop"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:text-primary/80"
              >
                <ExternalLink className="w-4 h-4" />
                Download Claude Desktop
              </a>
            </div>
          </div>

          {/* Step 2: Open Settings */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                2
              </div>
              <h3 className="text-lg font-medium">Open MCP Settings</h3>
            </div>
            <div className="ml-11">
              <p className="text-muted-foreground mb-3">
                In Claude Desktop, go to Settings → MCP Servers (or Custom Connectors)
              </p>
              <div className="bg-muted rounded p-3">
                <p className="text-sm font-mono">
                  Claude Desktop → Preferences → MCP Servers → Add Server
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Server Configuration */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                3
              </div>
              <h3 className="text-lg font-medium">Add Industrial MCP Server</h3>
            </div>
            <div className="ml-11 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Server Name:</label>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-3 py-2 rounded flex-1">industrial-mcp</code>
                  <button
                    onClick={() => copyToClipboard('industrial-mcp', 'server_name')}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded"
                  >
                    {copied.server_name ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Server URL:</label>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-3 py-2 rounded flex-1">{config.system.server_url}/api/mcp</code>
                  <button
                    onClick={() => copyToClipboard(`${config.system.server_url}/api/mcp`, 'server_url')}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded"
                  >
                    {copied.server_url ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Transport Type:</label>
                <code className="bg-muted px-3 py-2 rounded block">HTTP</code>
              </div>
            </div>
          </div>

          {/* Step 4: Authentication Setup */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                4
              </div>
              <h3 className="text-lg font-medium">Configure Authentication</h3>
            </div>
            <div className="ml-11">
              {authType === 'oauth' ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
                    <h4 className="font-medium mb-2">OAuth 2.1 Setup</h4>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="font-medium">Client ID:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="bg-muted px-2 py-1 rounded flex-1">{config.setup.authentication.client_id}</code>
                          <button
                            onClick={() => copyToClipboard(config.setup.authentication.client_id || '', 'client_id')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded"
                          >
                            {copied.client_id ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Authorization URL:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="bg-muted px-2 py-1 rounded flex-1 text-xs">{config.setup.authentication.authorization_url}</code>
                          <button
                            onClick={() => copyToClipboard(config.setup.authentication.authorization_url || '', 'auth_url')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded"
                          >
                            {copied.auth_url ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Token URL:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="bg-muted px-2 py-1 rounded flex-1 text-xs">{config.setup.authentication.token_url}</code>
                          <button
                            onClick={() => copyToClipboard(config.setup.authentication.token_url || '', 'token_url')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded"
                          >
                            {copied.token_url ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-4">
                    <h4 className="font-medium mb-2">API Key Authentication</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Add these headers to your MCP server configuration:
                    </p>
                    <div className="space-y-2 text-sm">
                      {config.setup.authentication.headers && Object.entries(config.setup.authentication.headers).map(([key, value]) => (
                        <div key={key}>
                          <span className="font-medium">{key}:</span>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="bg-muted px-2 py-1 rounded flex-1">{value}</code>
                            <button
                              onClick={() => copyToClipboard(value, key)}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded"
                            >
                              {copied[key] ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 5: Test Connection */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                5
              </div>
              <h3 className="text-lg font-medium">Test & Connect</h3>
            </div>
            <div className="ml-11">
              <p className="text-muted-foreground mb-4">
                Save your configuration and test the connection. Claude Desktop should now have access to 18 tools across both databases.
              </p>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
                <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">Available Tools:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {['Analytics Tools (8)', 'Knowledge Graph (4)', 'System Tools (6)'].map(category => (
                    <div key={category} className="bg-green-100 dark:bg-green-800/30 px-2 py-1 rounded text-sm text-green-700 dark:text-green-300">
                      {category}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Troubleshooting</h2>
          <div className="space-y-4">
            <div className="border-l-4 border-amber-400 pl-4">
              <h3 className="font-medium mb-1">Connection Failed</h3>
              <p className="text-sm text-muted-foreground">
                Check that the server URL is correct and the server is running. Test connectivity at: {config.system.server_url}/api/health
              </p>
            </div>
            <div className="border-l-4 border-amber-400 pl-4">
              <h3 className="font-medium mb-1">Authentication Error</h3>
              <p className="text-sm text-muted-foreground">
                {authType === 'oauth' 
                  ? 'Verify OAuth configuration and ensure you have completed the authorization flow'
                  : 'Check that your API key and MAC address are correct in the headers'
                }
              </p>
            </div>
            <div className="border-l-4 border-amber-400 pl-4">
              <h3 className="font-medium mb-1">No Tools Available</h3>
              <p className="text-sm text-muted-foreground">
                Ensure your authentication has the correct scopes/permissions and the server is properly configured.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Industrial MCP Server • MCP Protocol {config.system.mcp_version} • {config.setup.authentication.type}</p>
          <p className="mt-1">Server: <code>{config.system.server_url}</code></p>
        </div>
      </div>
    </div>
  );
}