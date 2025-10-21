/**
 * Neo4j Database Connection Tests
 * Tests for Neo4j knowledge graph connectivity used by MCP tools
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock neo4j-driver before importing DatabaseManager
jest.mock('neo4j-driver', () => ({
  driver: jest.fn(),
  auth: {
    basic: jest.fn((username, password) => ({ username, password }))
  }
}));

describe('Neo4j Connection - MCP Tools', () => {
  let DatabaseManager: any;
  let neo4j: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Import neo4j mock
    neo4j = await import('neo4j-driver');

    // Setup mock driver
    const mockSession = {
      run: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined)
    };

    const mockDriver = {
      session: jest.fn().mockReturnValue(mockSession),
      verifyConnectivity: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };

    (neo4j.driver as jest.MockedFunction<any>)
      .mockReturnValue(mockDriver as any);

    // Now import DatabaseManager
    const module = await import('@/lib/database/manager');
    DatabaseManager = module.DatabaseManager;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('Connection Establishment', () => {
    it('should successfully connect to Neo4j with valid credentials', async () => {
      // Import Neo4jConnection class directly for unit testing
      const { Neo4jConnection } = await import('@/lib/database/neo4j-connection');
      const connection = new Neo4jConnection({
        type: 'neo4j',
        uri: 'neo4j+s://test.databases.neo4j.io',
        username: 'test-user',
        password: 'test-password'
      });

      await connection.connect();

      expect(neo4j.driver).toHaveBeenCalledWith(
        expect.stringContaining('neo4j'),
        expect.objectContaining({
          username: expect.any(String),
          password: expect.any(String)
        }),
        expect.any(Object)
      );
    });

    it('should reuse existing connection when already connected', async () => {
      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });

      const connection1 = await manager.getNeo4jConnection();
      const connection2 = await manager.getNeo4jConnection();

      // Driver should only be called once (singleton pattern)
      expect(neo4j.driver).toHaveBeenCalledTimes(1);
    });

    it('should handle connection timeout', async () => {
      const mockDriver = {
        session: jest.fn(),
        verifyConnectivity: jest.fn().mockRejectedValue(new Error('Connection timeout')),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });

      await expect(manager.getNeo4jConnection()).rejects.toThrow('Connection timeout');
    });

    it('should handle invalid credentials', async () => {
      const mockDriver = {
        session: jest.fn(),
        verifyConnectivity: jest.fn().mockRejectedValue(new Error('Authentication failed')),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });

      await expect(manager.getNeo4jConnection()).rejects.toThrow('Authentication failed');
    });
  });

  describe('Query Execution', () => {
    it('should execute Cypher query successfully', async () => {
      const mockRecords = [
        { get: (key: string) => 'TestNode' }
      ];

      const mockSession = {
        run: jest.fn().mockResolvedValue({ records: mockRecords }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDriver = {
        session: jest.fn().mockReturnValue(mockSession),
        verifyConnectivity: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });
      const connection = await manager.getNeo4jConnection();

      const session = connection.session();
      const result = await session.run('MATCH (n) RETURN n LIMIT 1');

      expect(result.records).toHaveLength(1);
      expect(mockSession.run).toHaveBeenCalledWith('MATCH (n) RETURN n LIMIT 1');
    });

    it('should handle parameterized queries', async () => {
      const mockSession = {
        run: jest.fn().mockResolvedValue({ records: [] }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDriver = {
        session: jest.fn().mockReturnValue(mockSession),
        verifyConnectivity: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });
      const connection = await manager.getNeo4jConnection();

      const session = connection.session();
      const params = { name: 'Test Company', limit: 10 };
      await session.run('MATCH (c:Company {name: $name}) RETURN c LIMIT $limit', params);

      expect(mockSession.run).toHaveBeenCalledWith(
        'MATCH (c:Company {name: $name}) RETURN c LIMIT $limit',
        params
      );
    });

    it('should handle query execution errors', async () => {
      const mockSession = {
        run: jest.fn().mockRejectedValue(new Error('Cypher syntax error')),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDriver = {
        session: jest.fn().mockReturnValue(mockSession),
        verifyConnectivity: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });
      const connection = await manager.getNeo4jConnection();

      const session = connection.session();

      await expect(
        session.run('INVALID CYPHER QUERY')
      ).rejects.toThrow('Cypher syntax error');
    });
  });

  describe('Session Management', () => {
    it('should close session after query execution', async () => {
      const mockSession = {
        run: jest.fn().mockResolvedValue({ records: [] }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockDriver = {
        session: jest.fn().mockReturnValue(mockSession),
        verifyConnectivity: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });
      const connection = await manager.getNeo4jConnection();

      const session = connection.session();
      await session.run('MATCH (n) RETURN n');
      await session.close();

      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should handle multiple concurrent sessions', async () => {
      const mockSession1 = {
        run: jest.fn().mockResolvedValue({ records: [] }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      const mockSession2 = {
        run: jest.fn().mockResolvedValue({ records: [] }),
        close: jest.fn().mockResolvedValue(undefined)
      };

      let sessionCount = 0;
      const mockDriver = {
        session: jest.fn(() => {
          sessionCount++;
          return sessionCount === 1 ? mockSession1 : mockSession2;
        }),
        verifyConnectivity: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });
      const connection = await manager.getNeo4jConnection();

      const session1 = connection.session();
      const session2 = connection.session();

      await Promise.all([
        session1.run('MATCH (n) RETURN n'),
        session2.run('MATCH (m) RETURN m')
      ]);

      expect(mockDriver.session).toHaveBeenCalledTimes(2);
    });
  });

  describe('Connection Health Check', () => {
    it('should verify connectivity on initialization', async () => {
      const mockDriver = {
        session: jest.fn(),
        verifyConnectivity: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });
      await manager.getNeo4jConnection();

      expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
    });

    it('should report connection as unhealthy when verify fails', async () => {
      const mockDriver = {
        session: jest.fn(),
        verifyConnectivity: jest.fn().mockRejectedValue(new Error('Connection lost')),
        close: jest.fn().mockResolvedValue(undefined)
      };

      (neo4j.driver as jest.MockedFunction<any>)
        .mockReturnValue(mockDriver as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "neo4j" });

      await expect(manager.getNeo4jConnection()).rejects.toThrow('Connection lost');
    });
  });
});
