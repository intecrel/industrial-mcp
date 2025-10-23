# 🏭 Industrial MCP Server

A comprehensive **Model Context Protocol (MCP)** server designed for industrial system monitoring and control. Built with Next.js, TypeScript, and the Vercel MCP adapter, this server provides Claude AI with powerful tools to interact with industrial systems.

## 🚀 Live Demo

- **Production Server**: https://industrial-mcp-delta.vercel.app
- **MCP Endpoint**: https://industrial-mcp-delta.vercel.app/api/mcp
- **Health Check**: https://industrial-mcp-delta.vercel.app/api/health

## ✨ Features

### Available MCP Tools

- **🔄 Echo Tool** - Basic communication testing
- **📊 System Status** - Real-time industrial system health monitoring
- **📈 Operational Data** - Performance metrics and analytics
- **🔧 Equipment Monitor** - Individual equipment status and maintenance tracking

### Industrial Metrics Provided

- System uptime and health status
- CPU, memory, disk, and network monitoring
- Throughput and performance analytics
- Equipment temperature, vibration, and pressure readings
- Maintenance scheduling and alerts
- Historical trend analysis

## 🛠️ Quick Start

### Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Git**

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/intecrel/industrial-mcp.git
cd industrial-mcp
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start development server:**
```bash
npm run dev
```

4. **Verify the server is running:**
```bash
# Test basic endpoint
curl http://localhost:3000/api/mcp

# Test MCP protocol initialization
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {"roots": {"listChanged": false}},
      "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }
  }'
```

## 🧪 Testing with MCP Inspector

The MCP Inspector provides a web interface for testing your MCP server:

```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Run inspector against local server
mcp-inspector http://localhost:3000/api/mcp

# Or run against production server
mcp-inspector https://industrial-fvucjqopi-samuels-projects-2dd2e35e.vercel.app/api/mcp
```

## 🤖 Claude Desktop Integration

To connect this MCP server to Claude Desktop:

### 1. Edit Claude Desktop Configuration

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 2. Add Server Configuration

```json
{
  "mcpServers": {
    "industrial-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch",
        "http://localhost:3000/api/mcp"
      ]
    }
  }
}
```

### 3. Restart Claude Desktop

After saving the configuration, restart Claude Desktop to load the new MCP server.

### 4. Test in Claude

You can now use commands like:
- "Get the industrial system status"
- "Show me operational data for the last 24 hours"
- "Monitor equipment ID-12345 with history"
- "Echo test message"

## 🌐 Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel

# Deploy to production
vercel --prod
```

## 📁 Project Structure

```
industrial-mcp/
├── app/
│   ├── api/
│   │   └── [transport]/
│   │       └── route.ts          # Main MCP server implementation
│   ├── dashboard/
│   │   └── page.tsx              # Web dashboard
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── next.config.js                # Next.js configuration
└── README.md                     # This file
```

## 🔧 API Reference

### MCP Protocol Endpoints

All MCP communication happens via JSON-RPC 2.0 over HTTP:

**Base URL**: `/api/mcp`

#### Initialize Connection
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {"roots": {"listChanged": false}},
    "clientInfo": {"name": "client", "version": "1.0.0"}
  }
}
```

#### List Available Tools
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

#### Call a Tool
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_system_status",
    "arguments": {}
  }
}
```

### Tool Specifications

#### Echo Tool
- **Name**: `echo`
- **Parameters**: `message` (string, required)
- **Returns**: Echoed message

#### System Status Tool
- **Name**: `get_system_status`
- **Parameters**: None
- **Returns**: System health metrics, uptime, alerts

#### Operational Data Tool
- **Name**: `get_operational_data`
- **Parameters**: 
  - `timeRange` (string, optional): "1h", "24h", "7d"
  - `system` (string, optional): Specific system to query
- **Returns**: Performance metrics and trends

#### Equipment Monitor Tool
- **Name**: `monitor_equipment`
- **Parameters**:
  - `equipmentId` (string, required): Equipment identifier
  - `includeHistory` (boolean, optional): Include historical data
- **Returns**: Equipment status, metrics, maintenance info

## 🐛 Troubleshooting

### Common Issues

1. **"Cannot find module '@vercel/mcp-adapter'"**
   ```bash
   npm install @vercel/mcp-adapter
   ```

2. **"Method not allowed" errors**
   - Ensure you're using POST requests for MCP protocol
   - Include proper headers: `Content-Type: application/json` and `Accept: application/json, text/event-stream`

3. **Connection refused in Claude Desktop**
   - Verify the server is running on the correct port
   - Check Claude Desktop configuration file syntax
   - Restart Claude Desktop after configuration changes

4. **Build errors on deployment**
   ```bash
   npm run build  # Test build locally first
   npm run lint   # Fix any linting issues
   ```

### Debug Mode

Enable verbose logging by setting the environment variable:
```bash
DEBUG=mcp:* npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [Vercel MCP Adapter](https://github.com/vercel/mcp-adapter) - MCP implementation for Vercel
- [Claude AI](https://claude.ai/) - AI assistant integration
- [Next.js](https://nextjs.org/) - React framework
- [Anthropic](https://anthropic.com/) - MCP protocol development

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/samdurso/industrial-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/samdurso/industrial-mcp/discussions)
- **Email**: sam@industrial.marketing

---

**Made with ❤️ for Industrial Automation and AI Integration**
