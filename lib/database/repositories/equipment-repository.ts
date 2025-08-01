/**
 * Equipment Repository - Database operations for equipment management
 */

import { DatabaseConnection, QueryResult } from '../types'
import { Equipment } from '../types'

export class EquipmentRepository {
  constructor(private connection: DatabaseConnection) {}

  /**
   * Get all equipment with optional filtering
   */
  async getAll(filters?: {
    type?: string
    status?: Equipment['status']
    location?: string
    limit?: number
    offset?: number
  }): Promise<Equipment[]> {
    if (this.connection.type === 'neo4j') {
      return this.getAllNeo4j(filters)
    } else if (this.connection.type === 'mysql') {
      return this.getAllMySQL(filters)
    }
    
    throw new Error(`Unsupported database type: ${this.connection.type}`)
  }

  /**
   * Get equipment by ID
   */
  async getById(id: string): Promise<Equipment | null> {
    if (this.connection.type === 'neo4j') {
      return this.getByIdNeo4j(id)
    } else if (this.connection.type === 'mysql') {
      return this.getByIdMySQL(id)
    }
    
    throw new Error(`Unsupported database type: ${this.connection.type}`)
  }

  /**
   * Create new equipment
   */
  async create(equipment: Omit<Equipment, 'createdAt' | 'updatedAt'>): Promise<Equipment> {
    const now = new Date()
    const fullEquipment: Equipment = {
      ...equipment,
      createdAt: now,
      updatedAt: now
    }

    if (this.connection.type === 'neo4j') {
      return this.createNeo4j(fullEquipment)
    } else if (this.connection.type === 'mysql') {
      return this.createMySQL(fullEquipment)
    }
    
    throw new Error(`Unsupported database type: ${this.connection.type}`)
  }

  /**
   * Update equipment
   */
  async update(id: string, updates: Partial<Equipment>): Promise<Equipment | null> {
    const updatedEquipment = {
      ...updates,
      updatedAt: new Date()
    }

    if (this.connection.type === 'neo4j') {
      return this.updateNeo4j(id, updatedEquipment)
    } else if (this.connection.type === 'mysql') {
      return this.updateMySQL(id, updatedEquipment)
    }
    
    throw new Error(`Unsupported database type: ${this.connection.type}`)
  }

  /**
   * Delete equipment
   */
  async delete(id: string): Promise<boolean> {
    if (this.connection.type === 'neo4j') {
      return this.deleteNeo4j(id)
    } else if (this.connection.type === 'mysql') {
      return this.deleteMySQL(id)
    }
    
    throw new Error(`Unsupported database type: ${this.connection.type}`)
  }

  /**
   * Get equipment requiring maintenance
   */
  async getMaintenanceDue(days: number = 30): Promise<Equipment[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() + days)

    if (this.connection.type === 'neo4j') {
      const cypher = `
        MATCH (e:Equipment)
        WHERE e.nextMaintenance <= $cutoffDate
        RETURN e
        ORDER BY e.nextMaintenance ASC
      `
      const result = await this.connection.query(cypher, [cutoffDate])
      return result.data?.map(row => row.e) || []
    } else if (this.connection.type === 'mysql') {
      const sql = `
        SELECT * FROM equipment 
        WHERE next_maintenance <= ? 
        ORDER BY next_maintenance ASC
      `
      const result = await this.connection.query(sql, [cutoffDate])
      return this.convertMySQLToEquipment(result.data || [])
    }
    
    throw new Error(`Unsupported database type: ${this.connection.type}`)
  }

  // Neo4j implementations
  private async getAllNeo4j(filters?: any): Promise<Equipment[]> {
    let cypher = 'MATCH (e:Equipment)'
    const params: any[] = []
    const conditions: string[] = []

    if (filters?.type) {
      conditions.push('e.type = $param' + params.length)
      params.push(filters.type)
    }
    if (filters?.status) {
      conditions.push('e.status = $param' + params.length)
      params.push(filters.status)
    }
    if (filters?.location) {
      conditions.push('e.location = $param' + params.length)
      params.push(filters.location)
    }

    if (conditions.length > 0) {
      cypher += ' WHERE ' + conditions.join(' AND ')
    }

    cypher += ' RETURN e ORDER BY e.name'

    if (filters?.limit) {
      cypher += ` LIMIT ${filters.limit}`
    }
    if (filters?.offset) {
      cypher += ` SKIP ${filters.offset}`
    }

    const result = await this.connection.query(cypher, params)
    return result.data?.map(row => row.e) || []
  }

  private async getByIdNeo4j(id: string): Promise<Equipment | null> {
    const cypher = 'MATCH (e:Equipment {id: $param0}) RETURN e'
    const result = await this.connection.query(cypher, [id])
    return result.data?.[0]?.e || null
  }

  private async createNeo4j(equipment: Equipment): Promise<Equipment> {
    const cypher = `
      CREATE (e:Equipment {
        id: $param0,
        name: $param1,
        type: $param2,
        location: $param3,
        status: $param4,
        lastMaintenenance: $param5,
        nextMaintenance: $param6,
        specifications: $param7,
        createdAt: $param8,
        updatedAt: $param9
      })
      RETURN e
    `
    const params = [
      equipment.id,
      equipment.name,
      equipment.type,
      equipment.location,
      equipment.status,
      equipment.lastMaintenenance,
      equipment.nextMaintenance,
      equipment.specifications,
      equipment.createdAt,
      equipment.updatedAt
    ]
    
    const result = await this.connection.query(cypher, params)
    return result.data?.[0]?.e || equipment
  }

  private async updateNeo4j(id: string, updates: Partial<Equipment>): Promise<Equipment | null> {
    const setClause = Object.keys(updates)
      .map((key, index) => `e.${key} = $param${index + 1}`)
      .join(', ')
    
    const cypher = `
      MATCH (e:Equipment {id: $param0})
      SET ${setClause}
      RETURN e
    `
    
    const params = [id, ...Object.values(updates)]
    const result = await this.connection.query(cypher, params)
    return result.data?.[0]?.e || null
  }

  private async deleteNeo4j(id: string): Promise<boolean> {
    const cypher = 'MATCH (e:Equipment {id: $param0}) DETACH DELETE e'
    const result = await this.connection.query(cypher, [id])
    return (result.affected || 0) > 0
  }

  // MySQL implementations
  private async getAllMySQL(filters?: any): Promise<Equipment[]> {
    let sql = 'SELECT * FROM equipment'
    const params: any[] = []
    const conditions: string[] = []

    if (filters?.type) {
      conditions.push('type = ?')
      params.push(filters.type)
    }
    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.location) {
      conditions.push('location = ?')
      params.push(filters.location)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    sql += ' ORDER BY name'

    if (filters?.limit) {
      sql += ` LIMIT ${filters.limit}`
    }
    if (filters?.offset) {
      sql += ` OFFSET ${filters.offset}`
    }

    const result = await this.connection.query(sql, params)
    return this.convertMySQLToEquipment(result.data || [])
  }

  private async getByIdMySQL(id: string): Promise<Equipment | null> {
    const sql = 'SELECT * FROM equipment WHERE id = ?'
    const result = await this.connection.query(sql, [id])
    const equipmentData = result.data?.[0]
    return equipmentData ? this.convertMySQLToEquipment([equipmentData])[0] : null
  }

  private async createMySQL(equipment: Equipment): Promise<Equipment> {
    const sql = `
      INSERT INTO equipment (
        id, name, type, location, status, last_maintenance, 
        next_maintenance, specifications, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const params = [
      equipment.id,
      equipment.name,
      equipment.type,
      equipment.location,
      equipment.status,
      equipment.lastMaintenenance,
      equipment.nextMaintenance,
      JSON.stringify(equipment.specifications),
      equipment.createdAt,
      equipment.updatedAt
    ]
    
    await this.connection.query(sql, params)
    return equipment
  }

  private async updateMySQL(id: string, updates: Partial<Equipment>): Promise<Equipment | null> {
    const setClause = Object.keys(updates)
      .map(key => `${this.camelToSnake(key)} = ?`)
      .join(', ')
    
    const sql = `UPDATE equipment SET ${setClause} WHERE id = ?`
    const params = [...Object.values(updates), id]
    
    await this.connection.query(sql, params)
    return this.getByIdMySQL(id)
  }

  private async deleteMySQL(id: string): Promise<boolean> {
    const sql = 'DELETE FROM equipment WHERE id = ?'
    const result = await this.connection.query(sql, [id])
    return (result.affected || 0) > 0
  }

  // Utility methods
  private convertMySQLToEquipment(rows: any[]): Equipment[] {
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      location: row.location,
      status: row.status,
      lastMaintenenance: row.last_maintenance,
      nextMaintenance: row.next_maintenance,
      specifications: row.specifications ? JSON.parse(row.specifications) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
  }
}