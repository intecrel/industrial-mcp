import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const validateMacAddress = (mac: string) => {
  // Basic MAC address validation (XX:XX:XX:XX:XX:XX format)
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
  return macRegex.test(mac)
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        
        // Add your authentication logic here
        if (credentials.username === process.env.ADMIN_USER && 
            credentials.password === process.env.ADMIN_PASSWORD) {
          return {
            id: "1",
            name: credentials.username,
            email: "admin@example.com"
          }
        }
        return null
      }
    })
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async session({ session, token }) {
      return session
    }
  }
})

export { handler as GET, handler as POST }