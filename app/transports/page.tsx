/**
 * Multi-Transport Overview Page
 * Shows all available MCP transport methods and their configurations
 */

'use client';

import { useState, useEffect } from 'react';
import { Copy, CheckCircle, ExternalLink, Zap, Radio, Terminal, Globe, MessageCircle } from 'lucide-react';

interface TransportConfig {
  server: {
    name: string;
    version: string;
    mcp_version: string;
  };
  transports: {
    [key: string]: {
      name: string;
      description: string;
      endpoint?: string;
      bridge_script?: string;
      clients: string[];
      pros: string[];
      cons: string[];
      status?: string;
    };
  };
  system: {
    server_url: string;
    total_tools: number;
    databases: string[];
  };
}

const transportIcons = {
  http: Globe,
  stdio: Terminal,
  sse: Radio,
  websocket: MessageCircle
};

const transportColors = {
  http: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  stdio: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  sse: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
  websocket: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
};

export default function TransportsPage() {
  const [config, setConfig] = useState<TransportConfig | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/transport/config');
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to load transport config:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied({ ...copied, [key]: true });
    setTimeout(() => setCopied({ ...copied, [key]: false }), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading transport configurations...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-muted-foreground">Failed to load transport configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">
              MCP Transport Methods
            </h1>
          </div>
          <p className="text-xl text-muted-foreground">
            Industrial MCP Server supports multiple transport methods for maximum compatibility
          </p>
          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span>Server: {config.server.name} v{config.server.version}</span>
            <span>•</span>
            <span>MCP Protocol: {config.server.mcp_version}</span>
            <span>•</span>
            <span>{config.system.total_tools} Tools Available</span>
          </div>
        </div>

        {/* Transport Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {Object.entries(config.transports).map(([key, transport]) => {
            const Icon = transportIcons[key as keyof typeof transportIcons] || Globe;
            const colorClass = transportColors[key as keyof typeof transportColors] || transportColors.http;
            
            return (
              <div
                key={key}
                className={`p-6 rounded-lg border ${colorClass} cursor-pointer transition-all hover:shadow-md ${
                  selectedTransport === key ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedTransport(selectedTransport === key ? null : key)}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">{transport.name}</h3>
                    {transport.status && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        transport.status === 'planned' 
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      }`}>
                        {transport.status}
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground mb-4">
                  {transport.description}
                </p>

                {transport.endpoint && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 font-mono">
                        {transport.endpoint}
                      </code>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(transport.endpoint!, `${key}-endpoint`);
                        }}
                        className="p-1 hover:bg-muted rounded"
                      >
                        {copied[`${key}-endpoint`] ? 
                          <CheckCircle className="w-3 h-3 text-green-600" /> : 
                          <Copy className="w-3 h-3" />
                        }
                      </button>
                    </div>
                  </div>
                )}

                {transport.bridge_script && (
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-1">Bridge Script:</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 font-mono">
                        {transport.bridge_script}
                      </code>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(transport.bridge_script!, `${key}-script`);
                        }}
                        className="p-1 hover:bg-muted rounded"
                      >
                        {copied[`${key}-script`] ? 
                          <CheckCircle className="w-3 h-3 text-green-600" /> : 
                          <Copy className="w-3 h-3" />
                        }
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-1 mb-3">
                  {transport.clients.slice(0, 3).map(client => (
                    <span key={client} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                      {client}
                    </span>
                  ))}
                  {transport.clients.length > 3 && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                      +{transport.clients.length - 3} more
                    </span>
                  )}
                </div>

                {selectedTransport === key && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Pros</h4>
                        <ul className="space-y-1">
                          {transport.pros.map((pro, index) => (
                            <li key={index} className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-green-600" />
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium text-amber-700 dark:text-amber-300 mb-2">Considerations</h4>
                        <ul className="space-y-1">
                          {transport.cons.map((con, index) => (
                            <li key={index} className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0"></div>
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick Links */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Integration Guides</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/claude-integration"
              className="flex items-center gap-3 p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              <Globe className="w-5 h-5 text-primary" />
              <div>
                <div className="font-medium">Claude.ai</div>
                <div className="text-sm text-muted-foreground">Web Integration</div>
              </div>
            </a>
            
            <a
              href="/claude-desktop"
              className="flex items-center gap-3 p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              <Terminal className="w-5 h-5 text-primary" />
              <div>
                <div className="font-medium">Claude Desktop</div>
                <div className="text-sm text-muted-foreground">Native MCP</div>
              </div>
            </a>
            
            <a
              href="/api/transport/config"
              className="flex items-center gap-3 p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              <ExternalLink className="w-5 h-5 text-primary" />
              <div>
                <div className="font-medium">API Config</div>
                <div className="text-sm text-muted-foreground">JSON Configuration</div>
              </div>
            </a>
            
            <a
              href="/api/health"
              className="flex items-center gap-3 p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              <CheckCircle className="w-5 h-5 text-primary" />
              <div>
                <div className="font-medium">Health Check</div>
                <div className="text-sm text-muted-foreground">Server Status</div>
              </div>
            </a>
          </div>
        </div>

        {/* System Information */}
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-2xl font-semibold mb-4">System Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-medium mb-2">Server Details</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>URL: <code className="bg-muted px-1 rounded">{config.system.server_url}</code></div>
                <div>Version: {config.server.version}</div>
                <div>MCP Protocol: {config.server.mcp_version}</div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Capabilities</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Total Tools: {config.system.total_tools}</div>
                <div>Transports: {Object.keys(config.transports).length}</div>
                <div>Auth Methods: OAuth 2.1 + API Key</div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Data Sources</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                {config.system.databases.map(db => (
                  <div key={db}>{db}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Industrial MCP Server • Multi-Transport Architecture • MCP Protocol {config.server.mcp_version}</p>
        </div>
      </div>
    </div>
  );
}