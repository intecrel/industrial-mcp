/**
 * User Profile API Routes
 * Handles user profile management and MAC address linking
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { getFeatures } from '@/lib/config/feature-flags'
import { getRedisClient } from '@/lib/oauth/storage'
import { RedisKeys } from '@/lib/oauth/redis-keys'

const features = getFeatures()

// GET /api/user/profile - Get user profile with linked devices
export async function GET(request: NextRequest) {
  try {
    if (!features.AUTH0) {
      return NextResponse.json({ 
        error: 'auth_disabled', 
        message: 'Auth0 authentication is disabled' 
      }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Get user profile from Redis/storage
    const redis = getRedisClient()
    const profileKey = RedisKeys.client(`user:${session.user.auth0Id}`)
    
    let profile
    try {
      const profileData = await redis.get(profileKey)
      profile = profileData ? JSON.parse(profileData as string) : null
    } catch (redisError) {
      console.warn('📊 Redis unavailable, using session data:', redisError)
      profile = null
    }

    // Default profile structure
    if (!profile) {
      profile = {
        auth0Id: session.user.auth0Id,
        email: session.user.email,
        name: session.user.name,
        linkedDevices: [],
        tier: 'free',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        usage: {
          monthlyRequests: 0,
          usedRequests: 0,
          quota: 1000 // Free tier default
        }
      }
    }

    return NextResponse.json({
      success: true,
      profile
    })

  } catch (error) {
    console.error('❌ Error getting user profile:', error)
    return NextResponse.json({ 
      error: 'server_error', 
      message: 'Failed to get user profile' 
    }, { status: 500 })
  }
}

// PUT /api/user/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    if (!features.AUTH0) {
      return NextResponse.json({ 
        error: 'auth_disabled', 
        message: 'Auth0 authentication is disabled' 
      }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, preferences } = body

    // Get current profile
    const redis = getRedisClient()
    const profileKey = RedisKeys.client(`user:${session.user.auth0Id}`)
    
    let profile
    try {
      const profileData = await redis.get(profileKey)
      profile = profileData ? JSON.parse(profileData as string) : {}
    } catch (redisError) {
      console.warn('📊 Redis unavailable for profile update:', redisError)
      return NextResponse.json({ 
        error: 'storage_unavailable', 
        message: 'Profile storage unavailable' 
      }, { status: 503 })
    }

    // Update profile
    profile = {
      ...profile,
      auth0Id: session.user.auth0Id,
      email: session.user.email,
      name: name || session.user.name,
      preferences: preferences || profile.preferences || {},
      lastUpdated: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    }

    // Save updated profile
    await redis.set(profileKey, JSON.stringify(profile), { ex: 7 * 24 * 60 * 60 }) // 7 days TTL

    return NextResponse.json({
      success: true,
      profile
    })

  } catch (error) {
    console.error('❌ Error updating user profile:', error)
    return NextResponse.json({ 
      error: 'server_error', 
      message: 'Failed to update user profile' 
    }, { status: 500 })
  }
}