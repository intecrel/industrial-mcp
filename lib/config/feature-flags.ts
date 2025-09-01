/**
 * Centralized Feature Flag System for Modular Architecture
 * Controls module activation across development, preview, and production environments
 */

export interface FeatureFlags {
  // Authentication & Security Modules
  AUTH0: boolean;                    // Real Auth0 user authentication vs MAC+API fallback
  MAC_VERIFICATION: boolean;         // Secure MAC verification vs environment variable check
  ENHANCED_OAUTH: boolean;          // User-linked OAuth vs simple flow
  
  // User Experience Modules  
  LANDING_PAGE: boolean;            // Professional homepage vs technical MAC page
  USER_DASHBOARD: boolean;          // User interface vs direct MCP connection
  
  // Business & Analytics Modules
  USAGE_TRACKING: boolean;          // Analytics/quotas vs unlimited usage
  MULTI_CLIENT: boolean;            // Multiple MCP clients vs single client
  
  // Administrative Modules
  ADMIN_INTERFACE: boolean;         // User/device management interface
  SYSTEM_MONITORING: boolean;       // Advanced monitoring and health checks
}

/**
 * Get feature flag configuration from environment variables
 * Supports both development (all enabled) and production (selective) modes
 */
export const getFeatureFlags = (): FeatureFlags => {
  // Development mode: Enable all modules for comprehensive testing
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Preview/Production: Selective module activation
  return {
    // Authentication & Security (High Priority)
    AUTH0: parseFlag('ENABLE_AUTH0', isDevelopment),
    MAC_VERIFICATION: parseFlag('ENABLE_MAC_VERIFICATION', true), // Always enabled for security
    ENHANCED_OAUTH: parseFlag('ENABLE_ENHANCED_OAUTH', isDevelopment),
    
    // User Experience
    LANDING_PAGE: parseFlag('ENABLE_LANDING_PAGE', isDevelopment),
    USER_DASHBOARD: parseFlag('ENABLE_USER_DASHBOARD', isDevelopment),
    
    // Business Features
    USAGE_TRACKING: parseFlag('ENABLE_USAGE_TRACKING', isDevelopment),
    MULTI_CLIENT: parseFlag('ENABLE_MULTI_CLIENT', isDevelopment),
    
    // Administrative
    ADMIN_INTERFACE: parseFlag('ENABLE_ADMIN_INTERFACE', isDevelopment),
    SYSTEM_MONITORING: parseFlag('ENABLE_SYSTEM_MONITORING', isDevelopment),
  };
};

/**
 * Parse individual feature flag from environment variable
 */
const parseFlag = (envVar: string, defaultValue: boolean): boolean => {
  const value = process.env[envVar];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
};

/**
 * Singleton feature flags instance
 */
let featureFlagsInstance: FeatureFlags | null = null;

/**
 * Get cached feature flags (avoids repeated environment variable parsing)
 */
export const getFeatures = (): FeatureFlags => {
  if (!featureFlagsInstance) {
    featureFlagsInstance = getFeatureFlags();
    console.log('🎛️ Feature flags initialized:', featureFlagsInstance);
  }
  return featureFlagsInstance;
};

/**
 * Reset feature flags (for testing or environment changes)
 */
export const resetFeatureFlags = (): void => {
  featureFlagsInstance = null;
  console.log('🔄 Feature flags reset');
};

/**
 * Check if a specific feature is enabled
 */
export const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
  return getFeatures()[feature];
};

/**
 * Get environment-specific feature flag recommendations
 */
export const getEnvironmentRecommendations = () => {
  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  
  if (env === 'development') {
    return {
      environment: 'Development',
      recommendation: 'All modules enabled for comprehensive testing',
      flags: {
        ENABLE_AUTH0: 'true',
        ENABLE_LANDING_PAGE: 'true',
        ENABLE_USER_DASHBOARD: 'true',
        ENABLE_ENHANCED_OAUTH: 'true',
        ENABLE_USAGE_TRACKING: 'true',
        ENABLE_MAC_VERIFICATION: 'true',
        ENABLE_MULTI_CLIENT: 'true',
        ENABLE_ADMIN_INTERFACE: 'true',
      }
    };
  }
  
  if (vercelEnv === 'preview') {
    return {
      environment: 'Preview',
      recommendation: 'Gradual module testing - enable progressively',
      flags: {
        ENABLE_MAC_VERIFICATION: 'true',  // Security fix
        ENABLE_LANDING_PAGE: 'true',      // UX testing
        ENABLE_AUTH0: 'false',            // Keep stable auth
        ENABLE_USER_DASHBOARD: 'false',   // Enable after Auth0
        ENABLE_ENHANCED_OAUTH: 'false',   // Enable after dashboard
        ENABLE_USAGE_TRACKING: 'false',   // Business features last
        ENABLE_MULTI_CLIENT: 'false',
        ENABLE_ADMIN_INTERFACE: 'false',
      }
    };
  }
  
  // Production
  return {
    environment: 'Production',
    recommendation: 'Conservative rollout - critical security first',
    flags: {
      ENABLE_MAC_VERIFICATION: 'true',   // Fix security hole immediately
      ENABLE_LANDING_PAGE: 'false',      // Enable after validation
      ENABLE_AUTH0: 'false',             // Enable after user testing
      ENABLE_USER_DASHBOARD: 'false',    // Enable with Auth0
      ENABLE_ENHANCED_OAUTH: 'false',    // Enable after user adoption
      ENABLE_USAGE_TRACKING: 'false',    // Business features after UX
      ENABLE_MULTI_CLIENT: 'false',
      ENABLE_ADMIN_INTERFACE: 'false',
    }
  };
};

/**
 * Feature dependency validation
 * Ensures required modules are enabled for dependent features
 */
export const validateFeatureDependencies = (): { valid: boolean; issues: string[] } => {
  const flags = getFeatures();
  const issues: string[] = [];
  
  // User Dashboard requires Auth0 for user context
  if (flags.USER_DASHBOARD && !flags.AUTH0) {
    issues.push('USER_DASHBOARD requires AUTH0 to be enabled for user context');
  }
  
  // Enhanced OAuth works best with Auth0 integration
  if (flags.ENHANCED_OAUTH && !flags.AUTH0) {
    issues.push('ENHANCED_OAUTH recommended with AUTH0 for user-linked tokens');
  }
  
  // Usage tracking needs user identification
  if (flags.USAGE_TRACKING && !flags.AUTH0) {
    issues.push('USAGE_TRACKING works better with AUTH0 for per-user analytics');
  }
  
  // Admin interface requires user management
  if (flags.ADMIN_INTERFACE && !flags.AUTH0) {
    issues.push('ADMIN_INTERFACE requires AUTH0 for user management capabilities');
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
};

/**
 * Export feature detection utilities for components
 */
export {
  getFeatures as default,
};