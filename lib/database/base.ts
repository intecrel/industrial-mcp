/**
 * Base database connection class with common functionality
 */

import { DatabaseConnection, DatabaseConfig, QueryResult, DatabaseType } from './types'

export abstract class BaseDatabaseConnection implements DatabaseConnection {
  protected config: DatabaseConfig
  protected _isConnected = false
  protected _inTransaction = false

  constructor(config: DatabaseConfig) {
    this.config = { ...config }
  }

  get type(): DatabaseType {
    return this.config.type
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  get inTransaction(): boolean {
    return this._inTransaction
  }

  // Abstract methods to be implemented by specific database drivers
  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract query<T = any>(query: string, params?: any[]): Promise<QueryResult<T>>
  abstract ping(): Promise<boolean>

  // Default transaction implementation (can be overridden)
  async beginTransaction(): Promise<void> {
    if (this._inTransaction) {
      throw new Error('Transaction already in progress')
    }
    await this.query('BEGIN TRANSACTION')
    this._inTransaction = true
  }

  async commit(): Promise<void> {
    if (!this._inTransaction) {
      throw new Error('No transaction in progress')
    }
    await this.query('COMMIT')
    this._inTransaction = false
  }

  async rollback(): Promise<void> {
    if (!this._inTransaction) {
      throw new Error('No transaction in progress')
    }
    await this.query('ROLLBACK')
    this._inTransaction = false
  }

  // Utility methods
  protected handleError(error: any, operation: string): QueryResult {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Database ${operation} error (${this.config.type}):`, errorMessage)
    
    return {
      success: false,
      error: errorMessage,
      data: undefined
    }
  }

  protected validateConnection(): void {
    if (!this._isConnected) {
      throw new Error(`Database connection not established (${this.config.type})`)
    }
  }

  // Connection retry logic
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000
  ): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt === maxRetries) {
          break
        }

        console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, lastError.message)
        await this.delay(delayMs * attempt) // Exponential backoff
      }
    }

    throw lastError || new Error('Operation failed after retries')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Query parameter sanitization
  protected sanitizeParams(params?: any[]): any[] {
    if (!params) return []
    
    return params.map(param => {
      if (param === null || param === undefined) {
        return null
      }
      if (typeof param === 'object' && !(param instanceof Date)) {
        return JSON.stringify(param)
      }
      return param
    })
  }

  // Connection health monitoring
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now()
    
    try {
      const isHealthy = await this.ping()
      const latency = Date.now() - startTime
      
      return {
        healthy: isHealthy,
        latency: isHealthy ? latency : undefined
      }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime
      }
    }
  }
}