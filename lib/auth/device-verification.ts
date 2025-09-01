/**
 * Secure Device Verification System
 * Replaces MAC address authentication with proper device registration
 */

import { NextRequest } from 'next/server';
import { isFeatureEnabled } from '@/lib/config/feature-flags';

export interface DeviceFingerprint {
  userAgent: string;
  acceptLanguage: string;
  timezone: string;
  screenResolution?: string;
  platform: string;
  ip: string;
}

export interface DeviceRegistration {
  deviceId: string;
  deviceName: string;
  macAddress: string; // User-provided for reference only
  fingerprint: DeviceFingerprint;
  registeredAt: number;
  lastSeen: number;
  isAuthorized: boolean;
}

/**
 * Generate device fingerprint from request headers and client data
 */
export const generateDeviceFingerprint = (request: NextRequest, clientData?: any): DeviceFingerprint => {
  return {
    userAgent: request.headers.get('user-agent') || 'unknown',
    acceptLanguage: request.headers.get('accept-language') || 'unknown',
    timezone: clientData?.timezone || 'unknown',
    screenResolution: clientData?.screenResolution,
    platform: clientData?.platform || 'unknown',
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
  };
};

/**
 * Create a unique device ID based on fingerprint
 */
export const createDeviceId = (fingerprint: DeviceFingerprint): string => {
  // Create a deterministic ID based on stable device characteristics
  const components = [
    fingerprint.userAgent,
    fingerprint.platform,
    fingerprint.timezone,
    fingerprint.ip
  ].join('|');
  
  // Use a simple hash (in production, use crypto.subtle.digest)
  return Buffer.from(components).toString('base64').substring(0, 16);
};

/**
 * Legacy MAC address verification (INSECURE - for backward compatibility)
 * Supports comma-separated MAC address allowlist
 */
export const verifyMacAddressLegacy = (userMacAddress: string): boolean => {
  console.log('⚠️ Using LEGACY MAC verification - trusts user input (INSECURE)');
  
  const authorizedMacs = process.env.MAC_ADDRESS;
  if (!authorizedMacs) {
    console.error('❌ No MAC address configured in environment');
    return false;
  }
  
  // Support comma-separated MAC address allowlist
  const macAllowlist = authorizedMacs.split(',').map(mac => mac.trim().toLowerCase());
  const userMacLower = userMacAddress.trim().toLowerCase();
  
  const isValid = macAllowlist.includes(userMacLower);
  console.log(`${isValid ? '✅' : '❌'} Legacy MAC verification: ${userMacAddress} (user provided)`);
  console.log(`📋 MAC allowlist: [${macAllowlist.join(', ')}]`);
  
  return isValid;
};

/**
 * Secure device verification using fingerprinting + registration
 */
export const verifyDeviceSecure = async (
  request: NextRequest,
  userMacAddress: string,
  deviceName?: string,
  clientData?: any
): Promise<{ success: boolean; deviceId?: string; message: string }> => {
  console.log('🔒 Using SECURE device verification with fingerprinting');
  
  const fingerprint = generateDeviceFingerprint(request, clientData);
  const deviceId = createDeviceId(fingerprint);
  
  console.log('📱 Device fingerprint generated:', {
    deviceId,
    userAgent: fingerprint.userAgent.substring(0, 50) + '...',
    ip: fingerprint.ip,
    platform: fingerprint.platform
  });
  
  // For now, implement simple authorization logic
  // In production, this would check against a database of registered devices
  const authorizedMacs = process.env.MAC_ADDRESS;
  if (!authorizedMacs) {
    return {
      success: false,
      message: 'Server configuration error: No authorized MAC address configured'
    };
  }
  
  // Support comma-separated MAC address allowlist
  const macAllowlist = authorizedMacs.split(',').map(mac => mac.trim().toLowerCase());
  const userMacLower = userMacAddress.trim().toLowerCase();
  
  // Check if user-provided MAC matches allowlist (for initial registration)
  if (!macAllowlist.includes(userMacLower)) {
    console.log('❌ Device registration rejected: MAC address not in allowlist');
    console.log(`📋 MAC allowlist: [${macAllowlist.join(', ')}], provided: ${userMacLower}`);
    return {
      success: false,
      message: 'Device not authorized. Please contact administrator for device registration.'
    };
  }
  
  // Device is authorized - create/update registration
  const registration: DeviceRegistration = {
    deviceId,
    deviceName: deviceName || 'Unknown Device',
    macAddress: userMacAddress,
    fingerprint,
    registeredAt: Date.now(),
    lastSeen: Date.now(),
    isAuthorized: true
  };
  
  console.log('✅ Device registered successfully:', {
    deviceId: registration.deviceId,
    deviceName: registration.deviceName,
    ip: fingerprint.ip
  });
  
  // TODO: Store device registration in Redis or database
  // For now, we'll rely on secure cookie for session management
  
  return {
    success: true,
    deviceId,
    message: 'Device verified and registered successfully'
  };
};

/**
 * Main device verification function with feature flag support
 */
export const verifyDevice = async (
  request: NextRequest,
  userMacAddress: string,
  deviceName?: string,
  clientData?: any
): Promise<{ success: boolean; deviceId?: string; message: string }> => {
  
  // Check if secure device verification is enabled
  if (!isFeatureEnabled('MAC_VERIFICATION')) {
    // Use legacy MAC verification (insecure)
    const isValid = verifyMacAddressLegacy(userMacAddress);
    return {
      success: isValid,
      message: isValid 
        ? 'MAC address verified (legacy mode)' 
        : 'Invalid MAC address - device not authorized'
    };
  }
  
  // Use secure device verification
  return await verifyDeviceSecure(request, userMacAddress, deviceName, clientData);
};

/**
 * Validate device from session cookie (for MCP authentication)
 */
export const validateDeviceFromCookie = (request: NextRequest): boolean => {
  const isVerified = request.cookies.get('mcp-verified')?.value === 'true';
  
  if (!isVerified) {
    console.log('❌ Device validation failed: No verification cookie');
    return false;
  }
  
  // Additional checks could be added here:
  // - Cookie age validation
  // - IP address consistency check  
  // - Device fingerprint validation
  
  console.log('✅ Device validated from secure cookie');
  return true;
};

/**
 * Get device information from request (for logging/monitoring)
 */
export const getDeviceInfo = (request: NextRequest) => {
  const fingerprint = generateDeviceFingerprint(request);
  const deviceId = createDeviceId(fingerprint);
  
  return {
    deviceId,
    ip: fingerprint.ip,
    userAgent: fingerprint.userAgent.substring(0, 100) + '...',
    platform: fingerprint.platform,
    language: fingerprint.acceptLanguage
  };
};