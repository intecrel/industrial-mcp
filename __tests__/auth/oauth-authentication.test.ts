/**
 * OAuth 2.1 Authentication Tests
 * Tests for Bearer token authentication with access_token and refresh_token
 * Covers 5 production Claude.ai custom connector users
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  authenticateOAuth,
  detectAuthMethod,
  hasToolPermission,
  AuthContext
} from '@/lib/oauth/auth-middleware';
import { validateAccessToken } from '@/lib/oauth/jwt';

jest.mock('@/lib/oauth/jwt');
jest.mock('@/lib/oauth/config');
jest.mock('@/lib/oauth/scopes', () => ({
  isToolAccessible: jest.fn()
}));

describe('OAuth 2.1 Authentication', () => {
  describe('detectAuthMethod', () => {
    it('should detect OAuth Bearer token method', () => {
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'authorization': 'Bearer test-token-123'
        }
      });

      const method = detectAuthMethod(request);
      expect(method).toBe('oauth');
    });

    it('should return none when no auth headers present', () => {
      const request = new NextRequest('http://localhost:3000/api/mcp');

      const method = detectAuthMethod(request);
      expect(method).toBe('none');
    });

    it('should detect API key method when x-api-key header present', () => {
      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'x-api-key': 'test-key'
        }
      });

      const method = detectAuthMethod(request);
      expect(method).toBe('api_key');
    });
  });

  describe('authenticateOAuth', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should successfully authenticate with valid access token', async () => {
      const mockClaims = {
        iss: 'https://industrial-mcp.vercel.app',
        sub: 'claude-connector-user-1',
        aud: 'https://industrial-mcp.vercel.app',
        client_id: 'claude-connector-user-1',
        scope: 'mcp:read mcp:write',
        token_type: 'access_token' as const,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };

      (validateAccessToken as jest.MockedFunction<typeof validateAccessToken>)
        .mockResolvedValue(mockClaims);

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'authorization': 'Bearer valid-access-token'
        }
      });

      const authContext = await authenticateOAuth(request);

      expect(authContext).toEqual({
        method: 'oauth',
        userId: 'claude-connector-user-1',
        clientId: 'claude-connector-user-1',
        scopes: ['mcp:read', 'mcp:write'],
        permissions: ['mcp:read', 'mcp:write']
      });
    });

    it('should reject expired access token', async () => {
      (validateAccessToken as jest.MockedFunction<typeof validateAccessToken>)
        .mockRejectedValue(new Error('Token expired'));

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'authorization': 'Bearer expired-token'
        }
      });

      await expect(authenticateOAuth(request)).rejects.toThrow(
        'OAuth authentication failed: Token expired'
      );
    });

    it('should reject malformed Bearer token', async () => {
      (validateAccessToken as jest.MockedFunction<typeof validateAccessToken>)
        .mockRejectedValue(new Error('Invalid token format'));

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'authorization': 'Bearer invalid-format'
        }
      });

      await expect(authenticateOAuth(request)).rejects.toThrow(
        'OAuth authentication failed: Invalid token format'
      );
    });

    it('should handle missing authorization header', async () => {
      (validateAccessToken as jest.MockedFunction<typeof validateAccessToken>)
        .mockRejectedValue(new Error('Missing Authorization header'));

      const request = new NextRequest('http://localhost:3000/api/mcp');

      await expect(authenticateOAuth(request)).rejects.toThrow(
        'OAuth authentication failed: Missing Authorization header'
      );
    });

    it('should parse multiple scopes correctly', async () => {
      const mockClaims = {
        iss: 'https://industrial-mcp.vercel.app',
        sub: 'claude-connector-user-2',
        aud: 'https://industrial-mcp.vercel.app',
        client_id: 'claude-connector-user-2',
        scope: 'mcp:read mcp:write mcp:admin database:query analytics:read',
        token_type: 'access_token' as const,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };

      (validateAccessToken as jest.MockedFunction<typeof validateAccessToken>)
        .mockResolvedValue(mockClaims);

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'authorization': 'Bearer multi-scope-token'
        }
      });

      const authContext = await authenticateOAuth(request);

      expect(authContext.scopes).toEqual([
        'mcp:read',
        'mcp:write',
        'mcp:admin',
        'database:query',
        'analytics:read'
      ]);
    });
  });

  describe('authenticateRequest', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Mock OAuth as enabled by default
      const { isOAuthEnabled } = require('@/lib/oauth/config');
      (isOAuthEnabled as jest.MockedFunction<typeof isOAuthEnabled>)
        .mockReturnValue(true);
    });

    it('should route to OAuth authentication for Bearer token', async () => {
      const mockClaims = {
        iss: 'https://industrial-mcp.vercel.app',
        sub: 'claude-connector-user-3',
        aud: 'https://industrial-mcp.vercel.app',
        client_id: 'claude-connector-user-3',
        scope: 'mcp:read',
        token_type: 'access_token' as const,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };

      (validateAccessToken as jest.MockedFunction<typeof validateAccessToken>)
        .mockResolvedValue(mockClaims);

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'authorization': 'Bearer test-token'
        }
      });

      const authContext = await authenticateRequest(request);

      expect(authContext.method).toBe('oauth');
      expect(authContext.userId).toBe('claude-connector-user-3');
    });

    it('should throw error when no authentication method provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/mcp');

      await expect(authenticateRequest(request)).rejects.toThrow(
        'Authentication required'
      );
    });

    it('should throw error when OAuth is disabled', async () => {
      const { isOAuthEnabled } = require('@/lib/oauth/config');
      (isOAuthEnabled as jest.MockedFunction<typeof isOAuthEnabled>)
        .mockReturnValue(false);

      const request = new NextRequest('http://localhost:3000/api/mcp', {
        headers: {
          'authorization': 'Bearer test-token'
        }
      });

      await expect(authenticateRequest(request)).rejects.toThrow(
        'OAuth authentication is disabled'
      );
    });
  });

  describe('hasToolPermission', () => {
    it('should grant access when user has required scope', () => {
      const authContext: AuthContext = {
        method: 'oauth',
        userId: 'claude-connector-user-4',
        clientId: 'claude-connector-user-4',
        scopes: ['mcp:read', 'database:query'],
        permissions: ['mcp:read', 'database:query']
      };

      // Mock isToolAccessible to check if scope includes tool access
      const { isToolAccessible } = require('@/lib/oauth/scopes');
      (isToolAccessible as jest.MockedFunction<typeof isToolAccessible>)
        .mockReturnValue(true);

      const hasAccess = hasToolPermission(authContext, 'query_database');
      expect(hasAccess).toBe(true);
    });

    it('should deny access when user lacks required scope', () => {
      const authContext: AuthContext = {
        method: 'oauth',
        userId: 'claude-connector-user-5',
        clientId: 'claude-connector-user-5',
        scopes: ['mcp:read'],
        permissions: ['mcp:read']
      };

      const { isToolAccessible } = require('@/lib/oauth/scopes');
      (isToolAccessible as jest.MockedFunction<typeof isToolAccessible>)
        .mockReturnValue(false);

      const hasAccess = hasToolPermission(authContext, 'analyze_data');
      expect(hasAccess).toBe(false);
    });

    it('should grant full access for API key authentication', () => {
      const authContext: AuthContext = {
        method: 'api_key',
        userId: 'api-key-user',
        permissions: ['*']
      };

      const hasAccess = hasToolPermission(authContext, 'any_tool');
      expect(hasAccess).toBe(true);
    });
  });
});
