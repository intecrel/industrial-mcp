export const AUTH_CONFIG = {
  MAC_ADDRESS: '84:94:37:e4:24:88',
  ALLOWED_IPS: process.env.ALLOWED_IPS?.split(',') || [],
  BASE_URL: process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000',
  API_KEY: process.env.API_KEY || 'development-key',
  CLAUDE_ENDPOINT: '/api/claude/connect',
  ACCESS_TOKEN: process.env.ACCESS_TOKEN
}