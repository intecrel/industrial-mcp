# Industrial MCP

Industrial MCP (Master Control Program) is a **Next.js 14** application that provides a secure, hardware-verified gateway to your organisational Knowledge Graph (Neo4j Aura or self-hosted) through a simple REST interface called the **Model Context Protocol (MCP)**.

Key features  
* MAC-address-based verification flow (no user accounts required)  
* Cookie-based session & middleware-protected routes  
* MCP endpoint for querying Neo4j (`/api/mcp`) with API-key auth  
* Tailwind-CSS UI with landing page & dashboard  
* Ready-to-deploy on Vercel – zero-config build

---

## 1 · Quick Start

```bash
# 1. Clone
git clone https://github.com/seoptiks123/industrial-mcp.git
cd industrial-mcp

# 2. Install dependencies
npm install        # or yarn / pnpm

# 3. Configure environment
cp .env.local .env.local            # edit values (see section 6)

# 4. Run locally
npm run dev
# visit http://localhost:3000
```

---

## 2 · Project Structure (partial)

```
app/                  ── Next.js (app-router) pages & API routes
├─ page.tsx           ── Landing page with MAC verification form
├─ dashboard/…        ── Auth-protected dashboard
├─ api/
│   ├─ verify/…       ── Verify MAC + status endpoints
│   ├─ logout/…       ── Logout (clears cookies)
│   └─ mcp/…          ── MCP protocol interface (GET/POST)
lib/                  ── Config & helpers
middleware.ts         ── Route protection
vercel.json           ── CORS + env mapping for Vercel
scripts/test-mcp.js   ── End-to-end test script
```

---

## 3 · Deploying to Vercel

1. **Create project** – in Vercel dashboard click **New Project** and select your repo.  
2. **Environment variables** – add the variables from table (§ 6).  
3. **Deploy** – press *Deploy*; Vercel will build with `@vercel/next`.  
4. **Custom domain (optional)** – Settings → Domains → Add.

`vercel.json` already exposes CORS headers and maps env-vars for runtime.

---

## 4 · API Usage Examples

### 4.1 Verification Flow

```bash
# Check status (no cookies yet) -----------------------------
curl https://<VERCEL_URL>/api/verify/status
# → {"verified":false}

# Verify device ---------------------------------------------
curl -c cookie.txt -X POST https://<VERCEL_URL>/api/verify \
  -H 'Content-Type: application/json' \
  -d '{"macAddress":"84:94:37:e4:24:88"}'

# Check status again ----------------------------------------
curl -b cookie.txt https://<VERCEL_URL>/api/verify/status
# → {"verified":true}
```

### 4.2 MCP Queries

```bash
# Get MCP service info --------------------------------------
curl https://<VERCEL_URL>/api/mcp \
  -H "x-api-key: $API_KEY"

# Run a Cypher query ----------------------------------------
curl -X POST https://<VERCEL_URL>/api/mcp \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"query":"MATCH (n) RETURN count(n) AS total"}'
```

Payloads follow the envelope:

```json
{
  "mcp": { "version": "1.0.0", "timestamp": "...", "status": "success" },
  "data": { "results": [...], "count": 42 }
}
```

---

## 5 · Testing

The repo includes a full test harness.

```bash
# Local dev server must be running on port 3000
npm run test:local                # verbose local tests

# Against production deployment
MCP_PROD_URL=https://industrial-mcp.vercel.app npm run test:prod
```

The script runs:
* status → verify → status-after-auth
* MCP info + sample Cypher queries
* logout → final status

---

## 6 · Environment Variables

| Variable        | Required | Description / Example                               |
|-----------------|----------|-----------------------------------------------------|
| `MAC_ADDRESS`   | ✔        | Authorised device MAC (e.g. `84:94:37:e4:24:88`)    |
| `API_KEY`       | ✔        | Long random string for `/api/mcp` auth             |
| `ALLOWED_IPS`   | ✖        | `127.0.0.1,::1` IPs that bypass MAC verification    |
| `ACCESS_TOKEN`  | ✖        | Claude / Anthropic API key (if used)               |
| `NEO4J_URI`     | ✖        | `neo4j+s://xxxxx.databases.neo4j.io`               |
| `NEO4J_USERNAME`| ✖        | `neo4j`                                            |
| `NEO4J_PASSWORD`| ✖        | your-password                                      |

On Vercel, define them in **Project → Settings → Environment Variables**.

---

## 7 · Troubleshooting

| Symptom                                       | Cause / Fix |
|-----------------------------------------------|-------------|
| **Build fails on Vercel**                     | Ensure Node 18+ (`engines` not pinning old Node) |
| **401 Unauthorized from `/api/mcp`**          | Missing/incorrect `API_KEY` header (`x-api-key` or `Authorization: Bearer`) |
| **Invalid MAC in production**                 | Wrong `MAC_ADDRESS` env value (case & separators matter) |
| **502 Neo4j errors**                          | Wrong `NEO4J_URI` or firewall not allowing Vercel IPs |
| **CORS browser errors**                       | Adjust origins in `vercel.json` → `routes.headers`  |
| **Still verified after logout**               | Clear browser cookies; ensure same domain/path       |

Need extra help?  
*Open an issue* on GitHub or tag **@seoptiks123**.

---

&copy; 2025 Industrial MCP – MIT License
