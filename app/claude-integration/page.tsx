/**
 * Claude.ai Integration Demo Page
 * Shows how to set up Industrial MCP with Claude.ai
 */

'use client';

import { useState, useEffect } from 'react';
import { Copy, CheckCircle, ExternalLink, Play } from 'lucide-react';

interface ConfigData {
  oauth: {
    client_id: string;
    authorization_endpoint: string;
    token_endpoint: string;
    scope: string;
  };
  mcp_server: {
    endpoint: string;
  };
  quick_start: {
    authorize_url: string;
  };
  system: {
    issuer: string;
  };
}

interface TestResult {
  success: boolean;
  tests: {
    basic_connectivity: {
      status: string;
      server_operational: boolean;
    };
    authentication?: {
      authenticated: boolean;
      scopes?: string[];
    };
  };
  available_tools?: string[];
}

export default function ClaudeIntegrationPage() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load configuration on component mount
    fetch('/api/claude/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied({ ...copied, [key]: true });
    setTimeout(() => setCopied({ ...copied, [key]: false }), 2000);
  };

  const testConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/claude/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      setTestResult(result);
    } catch (err) {
      console.error('Test failed:', err);
      setTestResult({
        success: false,
        tests: {
          basic_connectivity: {
            status: 'failed',
            server_operational: false
          }
        }
      });
    }
    setLoading(false);
  };

  if (!config) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading Claude.ai integration configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Claude.ai Integration Guide
          </h1>
          <p className="text-xl text-muted-foreground">
            Connect Claude.ai to Industrial MCP Server for advanced analytics and knowledge graph access
          </p>
        </div>

        {/* Connection Test */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Connection Test</h2>
            <button
              onClick={testConnection}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          
          {testResult && (
            <div className={`p-4 rounded-md ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className={`w-5 h-5 ${testResult.success ? 'text-green-600' : 'text-red-600'}`} />
                <span className="font-medium">
                  {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Server Status: {testResult.tests.basic_connectivity.server_operational ? 'Operational' : 'Offline'}
              </p>
              {testResult.available_tools && (
                <div>
                  <p className="text-sm font-medium mb-2">Available Tools ({testResult.available_tools.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {testResult.available_tools.map(tool => (
                      <span key={tool} className="px-2 py-1 text-xs bg-primary/10 text-primary rounded">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Setup */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Quick Setup for Claude.ai</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-2">1. MCP Server Configuration</h3>
              <div className="bg-muted rounded p-4 font-mono text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Server Endpoint:</span>
                  <button
                    onClick={() => copyToClipboard(config.mcp_server.endpoint, 'endpoint')}
                    className="flex items-center gap-1 text-primary hover:text-primary/80"
                  >
                    {copied.endpoint ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    Copy
                  </button>
                </div>
                <code className="text-primary">{config.mcp_server.endpoint}</code>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">2. OAuth Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">Client ID:</span>
                    <button
                      onClick={() => copyToClipboard(config.oauth.client_id, 'client_id')}
                      className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs"
                    >
                      {copied.client_id ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <code className="text-primary text-sm">{config.oauth.client_id}</code>
                </div>

                <div className="bg-muted rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">Scope:</span>
                    <button
                      onClick={() => copyToClipboard(config.oauth.scope, 'scope')}
                      className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs"
                    >
                      {copied.scope ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <code className="text-primary text-sm">{config.oauth.scope}</code>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">3. Authorization URL</h3>
              <div className="bg-muted rounded p-4 font-mono text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Quick Start Authorization:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(config.quick_start.authorize_url, 'auth_url')}
                      className="flex items-center gap-1 text-primary hover:text-primary/80"
                    >
                      {copied.auth_url ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      Copy
                    </button>
                    <a
                      href={config.quick_start.authorize_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:text-primary/80"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open
                    </a>
                  </div>
                </div>
                <code className="text-primary break-all">{config.quick_start.authorize_url}</code>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Instructions */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Step-by-Step Instructions</h2>
          <div className="space-y-6">
            <div className="border-l-4 border-primary pl-4">
              <h3 className="text-lg font-medium mb-2">Step 1: Open Claude.ai Settings</h3>
              <p className="text-muted-foreground">
                Navigate to Claude.ai and open your workspace settings or custom connectors section.
              </p>
            </div>

            <div className="border-l-4 border-primary pl-4">
              <h3 className="text-lg font-medium mb-2">Step 2: Add Remote MCP Server</h3>
              <p className="text-muted-foreground mb-2">
                Configure a new remote MCP server with these settings:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Server Type: <code className="bg-muted px-1 rounded">Remote MCP Server</code></li>
                <li>Endpoint: <code className="bg-muted px-1 rounded">{config.mcp_server.endpoint}</code></li>
                <li>Authentication: <code className="bg-muted px-1 rounded">OAuth 2.1</code></li>
                <li>Client ID: <code className="bg-muted px-1 rounded">{config.oauth.client_id}</code></li>
              </ul>
            </div>

            <div className="border-l-4 border-primary pl-4">
              <h3 className="text-lg font-medium mb-2">Step 3: Configure OAuth Endpoints</h3>
              <p className="text-muted-foreground mb-2">Set up the OAuth endpoints:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Authorization URL: <code className="bg-muted px-1 rounded">{config.oauth.authorization_endpoint}</code></li>
                <li>Token URL: <code className="bg-muted px-1 rounded">{config.oauth.token_endpoint}</code></li>
                <li>Scope: <code className="bg-muted px-1 rounded">{config.oauth.scope}</code></li>
              </ul>
            </div>

            <div className="border-l-4 border-primary pl-4">
              <h3 className="text-lg font-medium mb-2">Step 4: Test & Connect</h3>
              <p className="text-muted-foreground">
                Save your configuration and test the connection. Claude.ai should be able to access 
                analytics data from Matomo and knowledge graph data from Neo4j through the MCP interface.
              </p>
            </div>
          </div>
        </div>

        {/* Support Links */}
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-2xl font-semibold mb-4">Support & Documentation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/api/claude/support"
              className="flex items-center gap-2 p-3 bg-muted rounded hover:bg-muted/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Full Documentation</span>
            </a>
            <a
              href="/.well-known/oauth-authorization-server"
              className="flex items-center gap-2 p-3 bg-muted rounded hover:bg-muted/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>OAuth Metadata</span>
            </a>
            <a
              href="/api/health"
              className="flex items-center gap-2 p-3 bg-muted rounded hover:bg-muted/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Health Check</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Industrial MCP Server • OAuth 2.1 • MCP Protocol 2024-10-07
          </p>
          <p className="mt-1">
            Server: <code>{config.system.issuer}</code>
          </p>
        </div>
      </div>
    </div>
  );
}