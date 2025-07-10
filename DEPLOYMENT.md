# Industrial MCP – Deployment Guide

This document explains **how to deploy the Industrial MCP Next.js application to Vercel**, configure all required environment variables, expose the MCP endpoints, let external services connect, verify the installation, and troubleshoot the most common problems.

---

## 1. Deploying to Vercel

### 1.1 Prerequisites
- GitHub repository: `https://github.com/seoptiks123/industrial-mcp`
- Vercel account with GitHub integration
- Neo4j Aura instance (or self-hosted) if you plan to use graph features

### 1.2 One-click deploy
1. Log in to Vercel and click **New Project**.
2. Select the **industrial-mcp** repository.
3. Accept the detected framework (`Next.js`) – no extra build settings are required.
4. When prompted for **Environment Variables** (step 2 of the wizard) add the variables listed in section 2.
5. Press **Deploy** and wait ~1-2 minutes.  
   Vercel will assign a URL such as  
   `https://industrial-mcp.vercel.app`.

> After the first deployment every push to the `main` branch triggers a new build.

### 1.3 Custom domain (optional)
1. In the project dashboard open **Settings → Domains → Add**.  
2. Enter your domain (e.g. `mcp.yourcompany.com`) and follow Vercel’s DNS instructions.  
3. Once the CNAME record propagates you can use the custom domain everywhere the examples reference `<VERCEL_URL>`.

---

## 2. Environment Variable Setup

| Variable                 | Required | Example / Notes                                      |
|--------------------------|----------|------------------------------------------------------|
| `MAC_ADDRESS`           | ✔        | 84:94:37:e4:24:88 – authorised device address        |
| `API_KEY`               | ✔        | long-random-string used by external clients          |
| `ALLOWED_IPS`           | ✖        | Comma-separated IPv4/6 addresses that bypass MAC check |
| `ACCESS_TOKEN`          | ✖        | Claude / Anthropic API key (if used)                 |
| `NEO4J_URI`             | ✖        | neo4j+s://xxxxx.databases.neo4j.io                   |
| `NEO4J_USERNAME`        | ✖        | neo4j                                               |
| `NEO4J_PASSWORD`        | ✖        | ********                                            |

Add them in **Vercel → Project → Settings → Environment Variables**.  
The included `vercel.json` exposes them at build & runtime.

---

## 3. MCP Endpoint Configuration

The application ships with three main endpoints:

| Route | Purpose | Auth |
|-------|---------|------|
| `POST /api/verify` | Verify device MAC address, sets `mcp-verified` cookie | none |
| `GET  /api/verify/status` | Returns `{ verified: boolean }` | cookie |
| `GET/POST /api/mcp` | MCP protocol interface (Cypher queries, schema) | `x-api-key` or `Authorization: Bearer <API_KEY>` |

CORS headers are automatically added via `vercel.json`, allowing any origin (`*`).  
If you need stricter rules, edit the `routes → headers` section before deploying.

---

## 4. Connecting External Services

### 4.1 Basic cURL
```
curl -X POST https://<VERCEL_URL>/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"query":"MATCH (n) RETURN count(n) AS total"}'
```

### 4.2 Claude / OpenAI function call (pseudo-code)
```javascript
const res = await fetch('https://<VERCEL_URL>/api/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.MCP_API_KEY
  },
  body: JSON.stringify({
    query: 'MATCH (w:Worker)-[:REQUIRES_SKILL]->(s:Skill) RETURN w,s LIMIT 20'
  })
});
const data = await res.json();
```

Remember:  
• **Always send the API key**.  
• Responses follow the MCP envelope:  
```json
{
  "mcp": { "version": "1.0.0", "timestamp": "...", "status": "success" },
  "data": { "results": [...], "count": 42 }
}
```

---

## 5. Testing the Deployed MCP

1. **Status check**  
   `curl https://<VERCEL_URL>/api/verify/status` → expect `verified:false`
2. **Simulate verification**  
   `curl -c cookie.txt -X POST https://<VERCEL_URL>/api/verify -d '{"macAddress":"<MAC_ADDRESS>"}' -H 'Content-Type: application/json'`
3. **Confirm cookie works**  
   `curl -b cookie.txt https://<VERCEL_URL>/api/verify/status` → expect `verified:true`
4. **Run an MCP query**  
   `curl -H 'x-api-key: <API_KEY>' -d '{"query":"_GET_SCHEMA"}' https://<VERCEL_URL>/api/mcp`

If all four steps pass, the hosted MCP is ready.

---

## 6. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Build fails on Vercel | Node version mismatch | Vercel uses 18+; ensure no `engines` field pins older Node |
| 401 “Unauthorized” from `/api/mcp` | Missing/incorrect `API_KEY` header | Pass `x-api-key` **or** `Authorization: Bearer …` |
| 400 “Invalid MAC” locally works but prod fails | Wrong `MAC_ADDRESS` env value | Double-check case and separators on Vercel |
| 502 from Neo4j query | Wrong `NEO4J_URI` / credentials | Verify Aura connection string & firewall whitelisting |
| CORS errors in browser | Non-allowed origin | Edit `vercel.json → routes → headers` to restrict/expand origins |
| Stale cookies after redeploy | Domain mismatch or path | Clear browser cookies or use the new deployment URL |

---

### Need more help?
Open an issue in the GitHub repo or ping `@seoptiks123` on GitHub for support. Happy deploying!
