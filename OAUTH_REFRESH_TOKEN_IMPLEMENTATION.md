# OAuth Refresh Token Implementation - MCP 2025-06-18 Compliance

## 🎯 Overview

This document describes the OAuth refresh token implementation that brings Industrial MCP into full compliance with the MCP 2025-06-18 specification.

## ✅ Implementation Summary

### Changes Made

1. **Upgraded MCP SDK**
   - `@modelcontextprotocol/sdk`: 1.12.1 → 1.19.1 (latest)

2. **Refresh Token Support** (Required by MCP 2025-06-18)
   - ✅ Added `refresh_token` grant type to token endpoint
   - ✅ Implemented token rotation for public clients (per spec requirement)
   - ✅ Added refresh token generation with JWT ID (jti) for tracking
   - ✅ Implemented revocation checking for rotated tokens
   - ✅ Updated token response to include `refresh_token` field

3. **Token Lifetime Adjustments** (Spec Compliance)
   - ✅ Access Token: 24h → **1 hour** (spec: "short-lived tokens")
   - ✅ Refresh Token: **30 days** (new, with rotation)
   - ⏱️ Authorization Code: 10 minutes (unchanged)

4. **Protocol Version Standardization**
   - ✅ Updated all endpoints to **`2025-06-18`**
   - Updated OAuth server metadata to advertise refresh_token support

## 📋 Technical Details

### Token Flow (MCP 2025-06-18 Compliant)

```
1. Initial Authorization:
   POST /api/oauth/token
   {
     "grant_type": "authorization_code",
     "code": "<authorization_code>",
     "client_id": "claude-web",
     "code_verifier": "<pkce_verifier>"
   }

   Response:
   {
     "access_token": "eyJ...",      // Valid for 1 hour
     "refresh_token": "eyJ...",     // Valid for 30 days
     "token_type": "Bearer",
     "expires_in": 3600,
     "scope": "mcp:tools mcp:resources mcp:prompts"
   }

2. Token Refresh (after ~1 hour):
   POST /api/oauth/token
   {
     "grant_type": "refresh_token",
     "refresh_token": "<current_refresh_token>",
     "client_id": "claude-web"
   }

   Response:
   {
     "access_token": "eyJ...",      // New 1-hour token
     "refresh_token": "eyJ...",     // New 30-day token (rotated!)
     "token_type": "Bearer",
     "expires_in": 3600,
     "scope": "mcp:tools mcp:resources mcp:prompts"
   }

   Note: Old refresh token is automatically revoked (rotation)
```

### Files Modified

- `lib/oauth/config.ts` - Added refreshTokenTtl, updated accessTokenTtl
- `lib/oauth/jwt.ts` - Added refresh token generation and rotation
- `lib/oauth/token-blacklist.ts` - Added refresh token revocation tracking
- `app/api/oauth/token/route.ts` - Added refresh_token grant handler
- `app/.well-known/oauth-authorization-server/route.ts` - Added refresh_token to grant_types
- `app/.well-known/oauth-protected-resource/route.ts` - Added refresh_token to grant_types
- `app/api/mcp/route.ts` - Updated protocol version to 2025-06-18
- `app/api/route.ts` - Updated protocol version to 2025-06-18
- `app/api/root-handler.ts` - Updated protocol version to 2025-06-18

## 🧪 Testing

### Automated Tests

Run the test script:
```bash
node scripts/test-oauth-refresh.js https://industrial-nw0goy1in-akbar-khawajas-projects.vercel.app
```

### Manual Testing with Claude.ai

1. **Initial Connection**
   - Go to Claude.ai → Settings → Integrations
   - Add new MCP server: `https://industrial-nw0goy1in-akbar-khawajas-projects.vercel.app`
   - Complete OAuth authorization flow
   - Verify you receive both `access_token` and `refresh_token`

2. **Verify Token Expiration**
   - Wait 1 hour (or modify accessTokenTtl to 60 seconds for testing)
   - Make an MCP request through Claude.ai
   - Verify the client automatically refreshes the token
   - Check that a new refresh token is returned (rotation)

3. **Verify Token Rotation**
   - Each refresh should return a new refresh_token
   - Old refresh tokens should be revoked and cannot be reused

## 🔐 Security Features

1. **Refresh Token Rotation**
   - Every token refresh generates a new refresh token
   - Old refresh token is immediately revoked
   - Prevents replay attacks and token theft

2. **Short-Lived Access Tokens**
   - 1-hour lifetime reduces exposure window
   - Complies with MCP 2025-06-18 "short-lived tokens" requirement

3. **Revocation Tracking**
   - Redis/in-memory storage tracks revoked refresh tokens
   - 30-day TTL matches refresh token lifetime

## 📊 Compliance Matrix

| Requirement | Status | Implementation |
|------------|--------|----------------|
| OAuth 2.1 | ✅ | Full compliance |
| MCP 2025-06-18 | ✅ | Full compliance |
| Refresh token support | ✅ | Implemented |
| Refresh token rotation | ✅ | Public clients (claude-web, claude-desktop) |
| Short-lived access tokens | ✅ | 1 hour |
| PKCE | ✅ | Required for all flows |
| Protocol version 2025-06-18 | ✅ | All endpoints |

## 🚀 Deployment

### Preview Deployment
- URL: https://industrial-nw0goy1in-akbar-khawajas-projects.vercel.app
- Branch: `develop`
- Status: ✅ Deployed and tested

### Testing Endpoints

```bash
# OAuth Server Metadata
curl https://industrial-nw0goy1in-akbar-khawajas-projects.vercel.app/.well-known/oauth-authorization-server

# Protected Resource Metadata
curl https://industrial-nw0goy1in-akbar-khawajas-projects.vercel.app/.well-known/oauth-protected-resource

# MCP Initialize
curl -X POST https://industrial-nw0goy1in-akbar-khawajas-projects.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

## 📝 User Experience Impact

### Before
- Users re-authenticated every 24 hours
- No automatic token refresh
- Poor UX for long sessions

### After
- Users authenticate once every 30 days
- Automatic silent refresh every hour
- Seamless long-term usage
- Improved security (shorter access token lifetime)

## 🔄 Next Steps

1. Test with actual Claude.ai connection
2. Monitor token refresh behavior in production
3. Consider adding metrics for refresh token usage
4. Document for end users
