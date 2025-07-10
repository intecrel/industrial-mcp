# Vercel Setup Guide · Industrial MCP

This document walks you **click-by-click** through deploying the Industrial MCP to Vercel, wiring external services such as Claude-AI, testing the live endpoints, and fixing the most common issues.

---

## 1 · Create a New Vercel Project

| # | Action | Screenshot / What you see |
|---|--------|---------------------------|
| 1 | Log in to [Vercel](https://vercel.com) and press **“New Project”**. | ![Step 1 – New Project](https://placehold.co/600x140?text=New+Project+button) |
| 2 | Select the **`industrial-mcp`** repository (GitHub integration). | ![Repo List](https://placehold.co/600x140?text=Choose+Repo) |
| 3 | Framework is auto-detected as **Next.js** → click **Continue**. | ![Framework Detect](https://placehold.co/600x140?text=Next.js+detected) |
| 4 | **Environment Variables** panel appears – add ALL keys from table §2. | ![Env Vars](https://placehold.co/600x140?text=Environment+Variables) |
| 5 | Press **Deploy** and grab a ☕ – build takes ≈ 1–2 min. | ![Deploying](https://placehold.co/600x140?text=Deploy+logs) |
| 6 | When finished you’ll get a URL like `https://industrial-mcp.vercel.app`. | ![Live URL](https://placehold.co/600x140?text=Deployment+Live) |

> Tip Add a **custom domain** later via *Settings → Domains → Add* if you want `mcp.your-company.com`.

---

## 2 · Environment Variables (exact names & samples)

| Key | Required | Example value | Notes |
|-----|----------|---------------|-------|
| `MAC_ADDRESS` | ✔ | `84:94:37:e4:24:88` | The hardware address allowed to verify. |
| `API_KEY` | ✔ | `super-long-random-string` | Clients include it as `x-api-key`. |
| `ALLOWED_IPS` | – | `127.0.0.1,::1` | Comma list of IPs that bypass MAC check. |
| `ACCESS_TOKEN` | – | `sk-anthropic-…` | Claude / OpenAI key if you use AI calls. |
| `NEO4J_URI` | – | `neo4j+s://xxxx.databases.neo4j.io` | Aura connection string. |
| `NEO4J_USERNAME` | – | `neo4j` | Neo4j user. |
| `NEO4J_PASSWORD` | – | `hunter2` | Neo4j password. |

Add them exactly as above (**Project → Settings → Environment Variables → Add**).  
Vercel injects them at build *and* runtime via the included `vercel.json`.

---

## 3 · Connecting External Services (Claude, OpenAI, etc.)

### 3.1 Endpoint

```
POST https://<VERCEL_URL>/api/mcp
Headers:
  Content-Type: application/json
  x-api-key: <API_KEY>
Body:
  {
    "query": "MATCH (n) RETURN count(n) AS total",
    "params": {}
  }
```

### 3.2 Claude function-call example

```typescript
const res = await fetch('https://<VERCEL_URL>/api/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.MCP_API_KEY       // store in Claude’s env
  },
  body: JSON.stringify({
    query: 'MATCH (w:Worker)-[:REQUIRES_SKILL]->(s) RETURN w,s LIMIT 10'
  })
});
const data = await res.json();
console.log(data.data.results);
```

Replace `<VERCEL_URL>` with the deployment URL and set `MCP_API_KEY` in Claude’s environment panel.

---

## 4 · Smoke-Testing the Live MCP

Run these from any terminal with **curl**:

```bash
# (1) Verify status – expect false
curl https://<VERCEL_URL>/api/verify/status

# (2) Perform MAC verification (stores cookie)
curl -c cookie.txt -X POST https://<VERCEL_URL>/api/verify \
  -H 'Content-Type: application/json' \
  -d '{"macAddress":"84:94:37:e4:24:88"}'

# (3) Verify status again – expect true
curl -b cookie.txt https://<VERCEL_URL>/api/verify/status

# (4) MCP info endpoint
curl https://<VERCEL_URL>/api/mcp -H "x-api-key: <API_KEY>"

# (5) Cypher query
curl -X POST https://<VERCEL_URL>/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -d '{"query":"MATCH (n) RETURN count(n) AS total"}'
```

All five calls should return HTTP 200 and the expected JSON payloads.

---

## 5 · Common Deployment Issues & Fixes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| **Build fails on Vercel** | Old Node version pinned in `package.json` | Remove `engines` field or set `">=18"` |
| **401 Unauthorized from `/api/mcp`** | Missing or wrong `x-api-key` header | Pass correct key **or** `Authorization: Bearer …` |
| **400 “Invalid MAC”** | `MAC_ADDRESS` env variable typo | Match format `XX:XX:XX:XX:XX:XX` exactly (case-insensitive). |
| **CORS error in browser** | Non-allowed origin | Edit `vercel.json → routes → headers` (set specific origins). |
| **502 Neo4j error** | Bad Aura URI / firewall | Verify `NEO4J_URI`, whitelist Vercel IPs in Aura panel. |
| **Still Verified after Logout** | Cookie domain mismatch | Clear browser cookies or ensure same domain/path on new deploy. |
| **Claude cannot reach MCP** | Missing `ACCESS_TOKEN` or wrong URL | Confirm `ACCESS_TOKEN` set and Claude uses HTTPS URL. |

---

## 6 · Next Steps

1. **Add a custom domain** – improves cookie stability (`Settings → Domains`).  
2. **Scale** – switch Vercel project to *Pro* for extra compute if queries grow.  
3. **Monitor Neo4j** – set up Aura alerts for connection limits.  
4. **Enhance security** – rotate `API_KEY` periodically; restrict `ALLOWED_IPS`.  

Happy deploying 🚀  
Questions? Open a GitHub issue or ping **@seoptiks123**.
