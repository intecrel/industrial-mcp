/**
 * NextAuth.js Type Extensions
 * Extends default session and user types with Auth0 data
 */

import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      auth0Id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
    accessToken?: string
  }

  interface User {
    id: string
    auth0Id?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string
    auth0Id?: string
    accessToken?: string
  }
}