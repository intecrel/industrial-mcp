/**
 * MySQL Database Connection Tests
 * Tests for Cloud SQL MySQL connectivity used by Matomo analytics tools
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock mysql2 and Cloud SQL connector before importing
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn()
}));

jest.mock('@google-cloud/cloud-sql-connector', () => ({
  Connector: jest.fn().mockImplementation(() => ({
    getOptions: jest.fn(),
    close: jest.fn()
  }))
}));

describe('MySQL Connection - Matomo Analytics', () => {
  let DatabaseManager: any;
  let mysql: any;
  let CloudSQLConnector: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Import mocks
    mysql = await import('mysql2/promise');
    const cloudSqlModule = await import('@google-cloud/cloud-sql-connector');
    CloudSQLConnector = cloudSqlModule.Connector;

    // Setup mock pool
    const mockPool = {
      query: jest.fn(),
      execute: jest.fn(),
      getConnection: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined as any)
    };

    (mysql.createPool as jest.MockedFunction<any>)
      .mockReturnValue(mockPool as any);

    // Now import DatabaseManager
    const module = await import('@/lib/database/manager');
    DatabaseManager = module.DatabaseManager;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('Connection Establishment', () => {
    it('should successfully connect to Cloud SQL MySQL', async () => {
      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      expect(mysql.createPool).toHaveBeenCalled();
      expect(CloudSQLConnector).toHaveBeenCalled();
    });

    it('should reuse existing MySQL pool when already connected', async () => {
      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });

      const connection1 = await manager.getMySQLConnection();
      const connection2 = await manager.getMySQLConnection();

      // Pool should only be created once (singleton pattern)
      expect(mysql.createPool).toHaveBeenCalledTimes(1);
    });

    it('should handle Cloud SQL connection failure', async () => {
      const mockConnector = {
        getOptions: jest.fn().mockRejectedValue(new Error('Cloud SQL connection failed')),
        close: jest.fn()
      };

      (CloudSQLConnector as jest.MockedFunction<typeof CloudSQLConnector>)
        .mockImplementation(() => mockConnector);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });

      await expect(manager.getMySQLConnection()).rejects.toThrow('Cloud SQL connection failed');
    });

    it('should handle MySQL authentication failure', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Access denied for user')),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      await expect(connection.query('SELECT 1')).rejects.toThrow('Access denied for user');
    });
  });

  describe('Query Execution', () => {
    it('should execute SELECT query successfully', async () => {
      const mockRows = [{ count: 42, database: 'matomo' }];

      const mockPool = {
        query: jest.fn().mockResolvedValue([mockRows, []]),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      const [rows] = await connection.query('SELECT COUNT(*) as count FROM matomo_log_visit');

      expect(rows).toEqual(mockRows);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM matomo_log_visit');
    });

    it('should handle parameterized queries', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue([[], []]),
        execute: jest.fn().mockResolvedValue([[], []]),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      const params = [1, '2025-01-01'];
      await connection.execute(
        'SELECT * FROM matomo_log_visit WHERE idsite = ? AND visit_first_action_time >= ?',
        params
      );

      expect(mockPool.execute).toHaveBeenCalledWith(
        'SELECT * FROM matomo_log_visit WHERE idsite = ? AND visit_first_action_time >= ?',
        params
      );
    });

    it('should handle SQL syntax errors', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error("You have an error in your SQL syntax")),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      await expect(
        connection.query('INVALID SQL QUERY')
      ).rejects.toThrow("You have an error in your SQL syntax");
    });

    it('should handle queries to matomo_* tables', async () => {
      const mockRows = [
        { idvisit: 1, visit_total_time: 300 },
        { idvisit: 2, visit_total_time: 450 }
      ];

      const mockPool = {
        query: jest.fn().mockResolvedValue([mockRows, []]),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      const [rows] = await connection.query(
        'SELECT idvisit, visit_total_time FROM matomo_log_visit LIMIT 2'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty('visit_total_time');
    });
  });

  describe('Connection Pool Management', () => {
    it('should configure connection pool with correct settings', async () => {
      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      await manager.getMySQLConnection();

      expect(mysql.createPool).toHaveBeenCalledWith(
        expect.objectContaining({
          waitForConnections: expect.any(Boolean),
          connectionLimit: expect.any(Number),
          queueLimit: expect.any(Number)
        })
      );
    });

    it('should handle pool connection timeout', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Connection acquisition timeout')),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      await expect(
        connection.query('SELECT 1')
      ).rejects.toThrow('Connection acquisition timeout');
    });

    it('should close pool gracefully', async () => {
      const mockPool = {
        query: jest.fn(),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      await connection.end();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('Transaction Support', () => {
    it('should support connection-based transactions', async () => {
      const mockConnection = {
        beginTransaction: jest.fn().mockResolvedValue(undefined as any),
        commit: jest.fn().mockResolvedValue(undefined as any),
        rollback: jest.fn().mockResolvedValue(undefined as any),
        query: jest.fn().mockResolvedValue([[], []]),
        release: jest.fn()
      };

      const mockPool = {
        query: jest.fn(),
        execute: jest.fn(),
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const pool = await manager.getMySQLConnection();

      const connection = await pool.getConnection();
      await connection.beginTransaction();
      await connection.query('INSERT INTO test VALUES (1)');
      await connection.commit();
      connection.release();

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const mockConnection = {
        beginTransaction: jest.fn().mockResolvedValue(undefined as any),
        commit: jest.fn(),
        rollback: jest.fn().mockResolvedValue(undefined as any),
        query: jest.fn().mockRejectedValue(new Error('Constraint violation')),
        release: jest.fn()
      };

      const mockPool = {
        query: jest.fn(),
        execute: jest.fn(),
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const pool = await manager.getMySQLConnection();

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        await connection.query('INSERT INTO test VALUES (1)');
        await connection.commit();
      } catch (error) {
        await connection.rollback();
      }
      connection.release();

      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('Connection Health Check', () => {
    it('should verify MySQL connection health', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue([[{ result: 1 }], []]),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      const [rows] = await connection.query('SELECT 1 as result');

      expect(rows[0]).toEqual({ result: 1 });
    });

    it('should handle disconnection scenarios', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Connection lost')),
        execute: jest.fn(),
        getConnection: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined as any)
      };

      (mysql.createPool as jest.MockedFunction<any>)
        .mockReturnValue(mockPool as any);

      const manager = new DatabaseManager({ connections: {}, defaultConnection: "mysql" });
      const connection = await manager.getMySQLConnection();

      await expect(connection.query('SELECT 1')).rejects.toThrow('Connection lost');
    });
  });
});
