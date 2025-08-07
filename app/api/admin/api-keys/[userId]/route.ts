import { NextRequest, NextResponse } from 'next/server'

// Validate admin access
const validateAdminAccess = (request: NextRequest): boolean => {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) return false
  
  // For now, allow access with any valid API key
  // In production, you'd want specific admin keys
  const primaryKey = process.env.API_KEY
  return apiKey === primaryKey
}

// DELETE /api/admin/api-keys/[userId] - Revoke API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    if (!validateAdminAccess(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 401 }
      )
    }

    const { userId } = params

    if (!userId) {
      return NextResponse.json(
        { error: 'Validation error', message: 'User ID is required' },
        { status: 400 }
      )
    }

    // In a real implementation, you'd remove this from a database
    // For now, we'll return instructions for manual environment variable update
    
    return NextResponse.json({
      success: true,
      message: 'API key revocation instructions generated',
      instructions: [
        `To revoke API key for user "${userId}":`,
        '1. Remove the corresponding entry from MCP_API_KEYS environment variable',
        '2. Restart the server for changes to take effect',
        '3. The key will be immediately invalidated'
      ],
      revokedUserId: userId,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error revoking API key:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to revoke API key' },
      { status: 500 }
    )
  }
}