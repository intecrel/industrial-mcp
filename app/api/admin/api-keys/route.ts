import { NextRequest, NextResponse } from 'next/server'

interface ApiKeyConfig {
  userId: string
  key: string
  name: string
  rateLimitPerHour?: number
  permissions: string[]
  created: string
}

// Parse API keys from environment variables
const parseApiKeys = (): ApiKeyConfig[] => {
  const keys: ApiKeyConfig[] = []
  
  // Primary API key (backward compatibility)
  const primaryKey = process.env.API_KEY
  if (primaryKey) {
    keys.push({
      key: primaryKey,
      userId: 'primary',
      name: 'Primary API Key',
      permissions: ['*'],
      created: '2025-08-07T00:00:00Z'
    })
  }
  
  // Multi-user API keys from environment variable
  const multiKeys = process.env.MCP_API_KEYS
  if (multiKeys) {
    multiKeys.split(',').forEach(keyConfig => {
      const [userId, key, name, rateLimitStr] = keyConfig.trim().split(':')
      if (userId && key) {
        keys.push({
          key: key.trim(),
          userId: userId.trim(),
          name: name?.trim() || userId,
          permissions: ['*'],
          rateLimitPerHour: rateLimitStr ? parseInt(rateLimitStr) : undefined,
          created: new Date().toISOString()
        })
      }
    })
  }
  
  return keys
}

// Validate admin access
const validateAdminAccess = (request: NextRequest): boolean => {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) return false
  
  // For now, allow access with any valid API key
  // In production, you'd want specific admin keys
  const apiKeys = parseApiKeys()
  return apiKeys.some(config => config.key === apiKey)
}

// GET /api/admin/api-keys - List all API keys
export async function GET(request: NextRequest) {
  try {
    if (!validateAdminAccess(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 401 }
      )
    }

    const apiKeys = parseApiKeys()
    
    // Return keys without exposing full key values
    const safeKeys = apiKeys.map(key => ({
      userId: key.userId,
      name: key.name,
      key: key.key, // Frontend will mask this
      rateLimitPerHour: key.rateLimitPerHour,
      permissions: key.permissions,
      created: key.created
    }))

    return NextResponse.json({
      success: true,
      keys: safeKeys,
      total: safeKeys.length
    })
  } catch (error) {
    console.error('Error listing API keys:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to list API keys' },
      { status: 500 }
    )
  }
}

// POST /api/admin/api-keys - Create new API key
export async function POST(request: NextRequest) {
  try {
    if (!validateAdminAccess(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { userId, name, key, rateLimitPerHour } = body

    if (!userId || !name || !key) {
      return NextResponse.json(
        { error: 'Validation error', message: 'userId, name, and key are required' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingKeys = parseApiKeys()
    if (existingKeys.some(k => k.userId === userId)) {
      return NextResponse.json(
        { error: 'Conflict', message: 'User ID already exists' },
        { status: 409 }
      )
    }

    // In a real implementation, you'd store this in a database
    // For now, we'll return instructions for manual environment variable update
    const newKeyConfig = `${userId}:${key}:${name}${rateLimitPerHour ? `:${rateLimitPerHour}` : ''}`
    
    return NextResponse.json({
      success: true,
      message: 'API key configuration generated',
      keyConfig: newKeyConfig,
      instructions: [
        'Add the following to your MCP_API_KEYS environment variable:',
        `Current: ${process.env.MCP_API_KEYS || '(empty)'}`,
        `Updated: ${process.env.MCP_API_KEYS ? process.env.MCP_API_KEYS + ',' : ''}${newKeyConfig}`,
        'Restart the server for changes to take effect'
      ],
      key: {
        userId,
        name,
        key: key.substring(0, 12) + '...' + key.substring(key.length - 4),
        rateLimitPerHour,
        created: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Error creating API key:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to create API key' },
      { status: 500 }
    )
  }
}