/**
 * User Devices API Routes
 * Handles MAC address linking and device management
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { getFeatures } from '@/lib/config/feature-flags'
import { getRedisClient } from '@/lib/oauth/storage'
import { RedisKeys } from '@/lib/oauth/redis-keys'

const features = getFeatures()

interface Device {
  macAddress: string
  deviceName: string
  addedAt: string
  lastUsed?: string
  isActive: boolean
}

// GET /api/user/devices - Get linked devices
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

    // Get user's linked devices from Redis
    const redis = getRedisClient()
    const devicesKey = RedisKeys.client(`user:${session.user.auth0Id}:devices`)
    
    let devices: Device[] = []
    try {
      const devicesData = await redis.get(devicesKey)
      devices = devicesData ? JSON.parse(devicesData as string) : []
    } catch (redisError) {
      console.warn('📊 Redis unavailable, returning empty devices:', redisError)
    }

    return NextResponse.json({
      success: true,
      devices
    })

  } catch (error) {
    console.error('❌ Error getting user devices:', error)
    return NextResponse.json({ 
      error: 'server_error', 
      message: 'Failed to get user devices' 
    }, { status: 500 })
  }
}

// POST /api/user/devices - Link a new device
export async function POST(request: NextRequest) {
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
    const { macAddress, deviceName } = body

    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
    if (!macAddress || !macRegex.test(macAddress)) {
      return NextResponse.json({ 
        error: 'invalid_mac', 
        message: 'Invalid MAC address format' 
      }, { status: 400 })
    }

    if (!deviceName || deviceName.trim().length < 1) {
      return NextResponse.json({ 
        error: 'invalid_name', 
        message: 'Device name is required' 
      }, { status: 400 })
    }

    const normalizedMac = macAddress.toLowerCase().replace(/[:-]/g, ':')

    // Get current devices
    const redis = getRedisClient()
    const devicesKey = RedisKeys.client(`user:${session.user.auth0Id}:devices`)
    
    let devices: Device[] = []
    try {
      const devicesData = await redis.get(devicesKey)
      devices = devicesData ? JSON.parse(devicesData as string) : []
    } catch (redisError) {
      console.warn('📊 Redis unavailable for device linking:', redisError)
      return NextResponse.json({ 
        error: 'storage_unavailable', 
        message: 'Device storage unavailable' 
      }, { status: 503 })
    }

    // Check if device already linked
    const existingDevice = devices.find(d => d.macAddress.toLowerCase() === normalizedMac)
    if (existingDevice) {
      return NextResponse.json({ 
        error: 'device_exists', 
        message: 'Device is already linked to your account' 
      }, { status: 409 })
    }

    // Add new device
    const newDevice: Device = {
      macAddress: normalizedMac,
      deviceName: deviceName.trim(),
      addedAt: new Date().toISOString(),
      isActive: true
    }

    devices.push(newDevice)

    // Save updated devices list
    await redis.set(devicesKey, JSON.stringify(devices), { ex: 30 * 24 * 60 * 60 }) // 30 days TTL

    // Also create a reverse mapping for quick MAC -> User lookup
    const macKey = RedisKeys.client(`mac:${normalizedMac}`)
    await redis.set(macKey, JSON.stringify({
      userId: session.user.auth0Id,
      email: session.user.email,
      deviceName: newDevice.deviceName,
      linkedAt: newDevice.addedAt
    }), { ex: 30 * 24 * 60 * 60 })

    console.log(`✅ Device linked: ${deviceName} (${normalizedMac}) → ${session.user.email}`)

    return NextResponse.json({
      success: true,
      device: newDevice,
      message: 'Device linked successfully'
    })

  } catch (error) {
    console.error('❌ Error linking device:', error)
    return NextResponse.json({ 
      error: 'server_error', 
      message: 'Failed to link device' 
    }, { status: 500 })
  }
}

// DELETE /api/user/devices - Unlink a device
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const macAddress = searchParams.get('mac')

    if (!macAddress) {
      return NextResponse.json({ 
        error: 'missing_mac', 
        message: 'MAC address parameter is required' 
      }, { status: 400 })
    }

    const normalizedMac = macAddress.toLowerCase().replace(/[:-]/g, ':')

    // Get current devices
    const redis = getRedisClient()
    const devicesKey = RedisKeys.client(`user:${session.user.auth0Id}:devices`)
    
    let devices: Device[] = []
    try {
      const devicesData = await redis.get(devicesKey)
      devices = devicesData ? JSON.parse(devicesData as string) : []
    } catch (redisError) {
      console.warn('📊 Redis unavailable for device unlinking:', redisError)
      return NextResponse.json({ 
        error: 'storage_unavailable', 
        message: 'Device storage unavailable' 
      }, { status: 503 })
    }

    // Find and remove device
    const deviceIndex = devices.findIndex(d => d.macAddress.toLowerCase() === normalizedMac)
    if (deviceIndex === -1) {
      return NextResponse.json({ 
        error: 'device_not_found', 
        message: 'Device not found in your account' 
      }, { status: 404 })
    }

    const removedDevice = devices.splice(deviceIndex, 1)[0]

    // Save updated devices list
    await redis.set(devicesKey, JSON.stringify(devices), { ex: 30 * 24 * 60 * 60 })

    // Remove reverse mapping
    const macKey = RedisKeys.client(`mac:${normalizedMac}`)
    await redis.del(macKey)

    console.log(`✅ Device unlinked: ${removedDevice.deviceName} (${normalizedMac}) → ${session.user.email}`)

    return NextResponse.json({
      success: true,
      message: 'Device unlinked successfully'
    })

  } catch (error) {
    console.error('❌ Error unlinking device:', error)
    return NextResponse.json({ 
      error: 'server_error', 
      message: 'Failed to unlink device' 
    }, { status: 500 })
  }
}