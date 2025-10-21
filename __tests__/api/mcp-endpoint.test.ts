/**
 * MCP Endpoint Integration Tests
 * Tests for /api/mcp route with OAuth authentication
 * Covers 18 MCP tools used by Claude.ai custom connectors
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { POST, GET, OPTIONS } from '@/app/api/mcp/route';
import { NextRequest } from 'next/server';
import { authenticateRequest, hasToolPermission } from '@/lib/oauth/auth-middleware';

jest.mock('@/lib/oauth/auth-middleware', () => ({
  authenticateRequest: jest.fn(),
  hasToolPermission: jest.fn().mockReturnValue(true) // Default to true, individual tests can override
}));

describe('MCP Endpoint - Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset hasToolPermission to default (true) before each test
    (hasToolPermission as jest.MockedFunction<typeof hasToolPermission>)
      .mockReturnValue(true);
  });

  describe('POST /api/mcp - initialize method', () => {
    it('should allow unauthenticated initialize request', async () => {
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {}
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.result.protocolVersion).toBe('2025-06-18');
      expect(data.result.serverInfo.name).toBe('Industrial MCP - Minimal');
    });
  });

  describe('POST /api/mcp - tools/list method', () => {
    it('should allow unauthenticated tools/list request', async () => {
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.result.tools).toHaveLength(18);
      expect(data.result.tools[0].name).toBe('echo');
    });

    it('should return all 18 MCP tools', async () => {
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        })
      });

      const response = await POST(request);
      const data = await response.json();

      const expectedTools = [
        'echo',
        'explore_database',
        'query_database',
        'analyze_data',
        'get_cloud_sql_status',
        'get_cloud_sql_info',
        'query_knowledge_graph',
        'get_organizational_structure',
        'find_capability_paths',
        'get_visitor_analytics',
        'get_conversion_metrics',
        'get_content_performance',
        'query_matomo_database',
        'get_company_intelligence',
        'get_unified_dashboard_data',
        'correlate_operational_relationships',
        'get_knowledge_graph_stats',
        'get_usage_analytics'
      ];

      const toolNames = data.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toEqual(expectedTools);
    });
  });

  describe('POST /api/mcp - tools/call with authentication', () => {
    it('should require authentication for tools/call', async () => {
      (authenticateRequest as jest.MockedFunction<typeof authenticateRequest>)
        .mockRejectedValue(new Error('Missing Authorization header'));

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'test' }
          }
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe(-32001);
      expect(data.error.message).toBe('Authentication required');
    });

    it('should allow authenticated tools/call with valid Bearer token', async () => {
      (authenticateRequest as jest.MockedFunction<typeof authenticateRequest>)
        .mockResolvedValue({
          method: 'oauth',
          userId: 'claude-connector-user-1',
          clientId: 'claude-connector-user-1',
          scopes: ['mcp:read', 'mcp:write'],
          permissions: ['mcp:read', 'mcp:write']
        });

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': 'Bearer valid-token'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'Hello OAuth' }
          }
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.result.content[0].text).toContain('Hello OAuth');
    });

    it('should return 401 for expired access token', async () => {
      (authenticateRequest as jest.MockedFunction<typeof authenticateRequest>)
        .mockRejectedValue(new Error('Token expired'));

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': 'Bearer expired-token'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'test' }
          }
        })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.data.error).toContain('authentication_required');
    });
  });

  describe('GET /api/mcp', () => {
    it('should return server info without authentication', async () => {
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'GET'
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('Industrial MCP - Minimal');
      expect(data.version).toBe('1.0.0');
      expect(data.status).toBe('active');
    });
  });

  describe('OPTIONS /api/mcp - CORS preflight', () => {
    it('should handle CORS preflight request', async () => {
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        method: 'OPTIONS'
      });

      const response = await OPTIONS(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });
});

describe('MCP Endpoint - Tool Permission Checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should check tool permissions for OAuth users', async () => {
    const { hasToolPermission } = require('@/lib/oauth/auth-middleware');
    (hasToolPermission as jest.MockedFunction<typeof hasToolPermission>)
      .mockReturnValue(false);

    (authenticateRequest as jest.MockedFunction<typeof authenticateRequest>)
      .mockResolvedValue({
        method: 'oauth',
        userId: 'limited-user',
        clientId: 'limited-user',
        scopes: ['mcp:read'],
        permissions: ['mcp:read']
      });

    const request = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': 'Bearer limited-token'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'query_database',
          arguments: { query: 'SELECT 1' }
        }
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error.code).toBe(-32003);
    expect(data.error.message).toBe('Insufficient permissions');
  });

  it('should allow tool access when user has proper scopes', async () => {
    const { hasToolPermission } = require('@/lib/oauth/auth-middleware');
    (hasToolPermission as jest.MockedFunction<typeof hasToolPermission>)
      .mockReturnValue(true);

    (authenticateRequest as jest.MockedFunction<typeof authenticateRequest>)
      .mockResolvedValue({
        method: 'oauth',
        userId: 'full-access-user',
        clientId: 'full-access-user',
        scopes: ['mcp:read', 'mcp:write', 'database:query'],
        permissions: ['mcp:read', 'mcp:write', 'database:query']
      });

    const request = new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': 'Bearer full-access-token'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: { message: 'authorized' }
        }
      })
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.result.content[0].text).toContain('authorized');
  });
});
