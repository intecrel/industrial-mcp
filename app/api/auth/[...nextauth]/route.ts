/**
 * NextAuth.js Configuration with Auth0 Provider
 * Handles user authentication and session management
 */

import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth/config'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }