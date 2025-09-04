/**
 * MAC Address Verification with Auth0 Integration
 * Handles both legacy MAC+API and Auth0 user-linked MAC verification
 */

import { getFeatures } from '@/lib/config/feature-flags'
import { getRedisClient } from '@/lib/oauth/storage'
import { RedisKeys } from '@/lib/oauth/redis-keys'

export interface MacVerificationResult {
  isValid: boolean
  method: 'legacy' | 'auth0' | 'fallback'
  userId?: string
  deviceName?: string
  error?: string
}

/**
 * Verify MAC address using both Auth0 user-linked devices and legacy system
 */
export async function verifyMacAddress(macAddress: string): Promise<MacVerificationResult> {
  const features = getFeatures()
  
  if (!macAddress) {
    return {
      isValid: false,
      method: 'fallback',
      error: 'No MAC address provided'
    }
  }

  const normalizedMac = macAddress.toLowerCase().replace(/[:-]/g, ':')

  try {
    // Method 1: Auth0 user-linked device verification (if enabled)
    if (features.AUTH0) {
      const auth0Result = await verifyAuth0LinkedDevice(normalizedMac)
      if (auth0Result.isValid) {
        return auth0Result
      }
    }

    // Method 2: Legacy environment variable verification
    if (features.MAC_VERIFICATION) {
      const legacyResult = await verifyLegacyMacAddress(normalizedMac)
      if (legacyResult.isValid) {
        return legacyResult
      }
    } else {
      // Fallback: Use environment variable check (current behavior)
      const fallbackResult = verifyEnvironmentMacAddress(normalizedMac)
      if (fallbackResult.isValid) {
        return fallbackResult
      }
    }

    return {
      isValid: false,
      method: 'fallback',
      error: 'MAC address not authorized'
    }

  } catch (error) {
    console.error('❌ MAC verification error:', error)
    
    // Final fallback: Environment variable check
    const fallbackResult = verifyEnvironmentMacAddress(normalizedMac)
    return {
      ...fallbackResult,
      error: fallbackResult.error || 'Verification system unavailable'
    }
  }
}

/**
 * Verify MAC address against Auth0 user-linked devices
 */
async function verifyAuth0LinkedDevice(macAddress: string): Promise<MacVerificationResult> {
  try {
    const redis = getRedisClient()
    const macKey = RedisKeys.client(`mac:${macAddress}`)
    
    const deviceData = await redis.get(macKey)
    if (!deviceData) {
      return {
        isValid: false,
        method: 'auth0',
        error: 'Device not linked to any user'
      }
    }

    const device = JSON.parse(deviceData as string)
    
    return {
      isValid: true,
      method: 'auth0',
      userId: device.userId,
      deviceName: device.deviceName
    }

  } catch (error) {
    console.warn('📊 Auth0 device verification failed:', error)
    return {
      isValid: false,
      method: 'auth0',
      error: 'Device lookup failed'
    }
  }
}

/**
 * Verify MAC address using secure MAC verification system
 * TODO: Implement actual secure MAC verification
 */
async function verifyLegacyMacAddress(macAddress: string): Promise<MacVerificationResult> {
  // For now, fall back to environment variable check
  // In a real implementation, this would check against a secure database/service
  const envResult = verifyEnvironmentMacAddress(macAddress)
  return {
    ...envResult,
    method: 'legacy'
  }
}

/**
 * Verify MAC address against environment variable (current fallback system)
 */
function verifyEnvironmentMacAddress(macAddress: string): MacVerificationResult {
  const allowedMacs = process.env.MAC_ADDRESS?.split(',').map(mac => 
    mac.trim().toLowerCase().replace(/[:-]/g, ':')
  ) || []

  const isValid = allowedMacs.includes(macAddress)
  
  return {
    isValid,
    method: 'fallback',
    error: isValid ? undefined : 'MAC address not in environment allowlist'
  }
}

/**
 * Get MAC address from request headers
 */
export function getMacAddressFromRequest(request: Request): string | null {
  // Check common MAC address headers
  const macHeaders = [
    'x-mac-address',
    'mac-address',
    'device-mac',
    'x-device-mac'
  ]

  for (const header of macHeaders) {
    const mac = request.headers.get(header)
    if (mac) {
      return mac
    }
  }

  // Extract from user agent or other headers if needed
  // This is environment/client specific
  
  return null
}

/**
 * Check if MAC verification is required
 */
export function isMacVerificationRequired(): boolean {
  const features = getFeatures()
  return features.MAC_VERIFICATION || features.AUTH0
}

/**
 * Get user information from MAC address
 */
export async function getUserFromMacAddress(macAddress: string): Promise<{
  userId?: string
  email?: string
  deviceName?: string
} | null> {
  if (!macAddress) return null

  const normalizedMac = macAddress.toLowerCase().replace(/[:-]/g, ':')
  
  try {
    const redis = getRedisClient()
    const macKey = RedisKeys.client(`mac:${normalizedMac}`)
    
    const deviceData = await redis.get(macKey)
    if (!deviceData) return null

    const device = JSON.parse(deviceData as string)
    return {
      userId: device.userId,
      email: device.email,
      deviceName: device.deviceName
    }

  } catch (error) {
    console.warn('📊 Failed to get user from MAC address:', error)
    return null
  }
}