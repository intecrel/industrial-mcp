import { NextRequest, NextResponse } from 'next/server'

// Mock usage data - in production this would come from the actual usage log
const getMockUsageStats = () => {
  return {
    primary: {
      userId: 'primary',
      totalRequests: 42,
      lastHour: 8,
      topTools: [
        { tool: 'get_knowledge_graph_stats', count: 12 },
        { tool: 'query_knowledge_graph', count: 8 },
        { tool: 'get_visitor_analytics', count: 6 }
      ],
      dailyUsage: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        requests: Math.floor(Math.random() * 20) + 5
      }))
    }
  }
}

// Validate admin access
const validateAdminAccess = (request: NextRequest): boolean => {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) return false
  
  // For now, allow access with any valid API key
  const primaryKey = process.env.API_KEY
  return apiKey === primaryKey
}

// GET /api/admin/usage-stats - Get usage statistics for all API keys
export async function GET(request: NextRequest) {
  try {
    if (!validateAdminAccess(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 401 }
      )
    }

    // In production, this would query the actual usage log
    // For now, return mock data
    const stats = getMockUsageStats()

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
      totalUsers: Object.keys(stats).length,
      totalRequests: Object.values(stats).reduce((sum: number, userStats: any) => sum + userStats.totalRequests, 0)
    })
  } catch (error) {
    console.error('Error getting usage stats:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get usage stats' },
      { status: 500 }
    )
  }
}