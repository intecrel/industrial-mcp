/**
 * NextAuth.js Configuration
 * Centralized auth configuration for sharing across API routes
 */

import Auth0Provider from 'next-auth/providers/auth0'
import { NextAuthOptions } from 'next-auth'
import { getFeatures } from '@/lib/config/feature-flags'

const features = getFeatures()

export const authOptions: NextAuthOptions = {
  providers: [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID!,
      clientSecret: process.env.AUTH0_CLIENT_SECRET!,
      issuer: process.env.AUTH0_ISSUER_BASE_URL!,
      authorization: {
        params: {
          scope: 'openid email profile',
          audience: process.env.AUTH0_AUDIENCE || 'https://industrial-mcp-dev.auth0.com/api/v2/',
        },
      },
    }),
  ],
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