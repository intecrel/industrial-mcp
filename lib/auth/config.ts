/**
 * NextAuth.js Configuration
 * Centralized auth configuration for sharing across API routes
 */

import Auth0Provider from 'next-auth/providers/auth0'
import { NextAuthOptions } from 'next-auth'
import { getFeatures } from '@/lib/config/feature-flags'

const features = getFeatures()

// Determine base URL for NextAuth
const getBaseUrl = () => {
  // In production/preview, use VERCEL_URL or NEXTAUTH_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }
  
  // Development fallback
  return process.env.AUTH0_BASE_URL || 'http://localhost:3000';
};

// Normalize Auth0 issuer URL (add https:// if missing)
const normalizeIssuerUrl = (url: string): string => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
};

// Validate Auth0 configuration
const validateAuth0Config = () => {
  const requiredVars = ['AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_ISSUER_BASE_URL', 'NEXTAUTH_SECRET'];
  const missing = requiredVars.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    console.error('🚨 Missing Auth0 configuration:', missing);
    return false;
  }
  
  // Validate URL formats
  const rawIssuerUrl = process.env.AUTH0_ISSUER_BASE_URL!;
  const normalizedIssuerUrl = normalizeIssuerUrl(rawIssuerUrl);
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  const computedBaseUrl = getBaseUrl();
  
  console.log('🔍 Validating Auth0 URLs:', {
    rawIssuerUrl,
    normalizedIssuerUrl,
    nextAuthUrl,
    computedBaseUrl,
    hasNextAuthUrl: !!nextAuthUrl,
    vercelUrl: process.env.VERCEL_URL
  });
  
  // Check if issuer URL is valid after normalization
  try {
    new URL(normalizedIssuerUrl);
    console.log('✅ Auth0 issuer URL validated:', normalizedIssuerUrl);
  } catch (error) {
    console.error('🚨 Invalid AUTH0_ISSUER_BASE_URL:', normalizedIssuerUrl, error);
    return false;
  }
  
  // Check if NEXTAUTH_URL is valid when provided
  if (nextAuthUrl) {
    try {
      new URL(nextAuthUrl);
    } catch (error) {
      console.error('🚨 Invalid NEXTAUTH_URL:', nextAuthUrl, error);
      return false;
    }
  }
  
  console.log('✅ Auth0 configuration validated');
  return true;
};

export const authOptions: NextAuthOptions = {
  providers: features.AUTH0 && validateAuth0Config() ? [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      issuer: normalizeIssuerUrl(process.env.AUTH0_ISSUER_BASE_URL!),
      authorization: {
        params: {
          scope: 'openid email profile',
          audience: process.env.AUTH0_AUDIENCE || 'https://industrial-mcp-dev.auth0.com/api/v2/',
        },
      },
    }),
  ] : [],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Persist Auth0 information to token
      if (account && profile) {
        token.accessToken = account.access_token
        token.sub = profile.sub
        token.auth0Id = profile.sub
      }
      return token
    },
    async session({ session, token }) {
      // Send properties to the client
      if (token) {
        session.user.id = token.sub as string
        session.user.auth0Id = token.auth0Id as string
        session.accessToken = token.accessToken as string
      }
      return session
    },
    async signIn({ user, account, profile }) {
      // Allow sign in if Auth0 is enabled
      if (!features.AUTH0) {
        console.log('🔒 Auth0 disabled via feature flag, blocking sign in')
        return false
      }
      
      // Debug Auth0 configuration
      console.log('🔍 Auth0 Debug Info:', {
        hasClientId: !!process.env.AUTH0_CLIENT_ID,
        hasClientSecret: !!process.env.AUTH0_CLIENT_SECRET,
        hasIssuer: !!process.env.AUTH0_ISSUER_BASE_URL,
        hasSecret: !!process.env.NEXTAUTH_SECRET,
        userEmail: user?.email,
        accountProvider: account?.provider,
        profileSub: profile?.sub
      });
      
      console.log('✅ Auth0 sign in allowed:', user.email)
      return true
    },
    async redirect({ url, baseUrl }) {
      // Redirect to dashboard after successful sign in
      if (url.startsWith('/')) return `${baseUrl}${url}`
      if (url.startsWith(baseUrl)) return url
      return `${baseUrl}/dashboard`
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}