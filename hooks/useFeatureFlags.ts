/**
 * React Hook for Feature Flag Detection
 * Provides client-side access to feature flags for conditional rendering
 */

import { useEffect, useState } from 'react';
import { getFeatures, type FeatureFlags } from '@/lib/config/feature-flags';

/**
 * Hook for accessing feature flags in React components
 * Handles server-side rendering and client-side hydration
 */
export const useFeatureFlags = () => {
  const [features, setFeatures] = useState<FeatureFlags | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Client-side feature flag detection - fetch from API
    const fetchFeatures = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (data.features) {
          // Map API response to our FeatureFlags interface
          const mappedFlags: FeatureFlags = {
            AUTH0: data.features.auth0_enabled ?? false,
            MAC_VERIFICATION: data.features.mac_verification ?? false,
            ENHANCED_OAUTH: data.features.oauth_enabled ?? false,
            LANDING_PAGE: data.features.landing_page ?? false,
            USER_DASHBOARD: data.features.user_dashboard ?? false,
            USAGE_TRACKING: data.features.usage_tracking ?? false,
            MULTI_CLIENT: data.features.multi_client ?? false,
            ADMIN_INTERFACE: data.features.admin_interface ?? false,
            SYSTEM_MONITORING: data.features.system_monitoring ?? false,
          };
          setFeatures(mappedFlags);
        } else {
          // Fallback to server-side detection
          const flags = getFeatures();
          setFeatures(flags);
        }
      } catch (error) {
        console.error('Failed to fetch feature flags:', error);
        // Fallback to server-side detection
        const flags = getFeatures();
        setFeatures(flags);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeatures();
  }, []);

  // Utility function to check if a specific feature is enabled
  const isEnabled = (feature: keyof FeatureFlags): boolean => {
    return features?.[feature] ?? false;
  };

  // Utility function to check multiple features
  const areEnabled = (featureList: (keyof FeatureFlags)[]): boolean => {
    return featureList.every(feature => isEnabled(feature));
  };

  // Utility function to check if any of the features are enabled
  const anyEnabled = (featureList: (keyof FeatureFlags)[]): boolean => {
    return featureList.some(feature => isEnabled(feature));
  };

  return {
    features,
    isLoading,
    isEnabled,
    areEnabled,
    anyEnabled,
    
    // Commonly used feature groups
    hasAuth: isEnabled('AUTH0'),
    hasUserDashboard: isEnabled('USER_DASHBOARD'),
    hasLandingPage: isEnabled('LANDING_PAGE'),
    hasUsageTracking: isEnabled('USAGE_TRACKING'),
    hasEnhancedOAuth: isEnabled('ENHANCED_OAUTH'),
    hasMacVerification: isEnabled('MAC_VERIFICATION'),
    hasMultiClient: isEnabled('MULTI_CLIENT'),
    hasAdminInterface: isEnabled('ADMIN_INTERFACE'),
  };
};

/**
 * Component wrapper for feature-flagged content
 * Only renders children if the specified feature is enabled
 */
interface FeatureGateProps {
  feature: keyof FeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({ 
  feature, 
  children, 
  fallback = null 
}) => {
  const { isEnabled, isLoading } = useFeatureFlags();

  // Don't render anything while loading
  if (isLoading) return null;

  // Render children if feature is enabled, otherwise fallback
  return isEnabled(feature) ? children : fallback;
};

/**
 * Component wrapper for multiple feature requirements
 * Supports both AND (all required) and OR (any required) logic
 */
interface MultiFeatureGateProps {
  features: (keyof FeatureFlags)[];
  mode?: 'all' | 'any';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const MultiFeatureGate: React.FC<MultiFeatureGateProps> = ({
  features,
  mode = 'all',
  children,
  fallback = null,
}) => {
  const { areEnabled, anyEnabled, isLoading } = useFeatureFlags();

  if (isLoading) return null;

  const shouldRender = mode === 'all' ? areEnabled(features) : anyEnabled(features);
  return shouldRender ? children : fallback;
};

/**
 * Hook for server-side feature flag detection
 * Use this in API routes and server components
 */
export const useServerFeatureFlags = () => {
  return getFeatures();
};