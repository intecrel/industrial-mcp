# GitHub Actions Secrets Configuration

This document lists the required secrets for the CI/CD pipeline.

## Required Secrets

Configure these secrets in your GitHub repository settings:
**Settings → Secrets and variables → Actions → Repository secrets**

### Vercel Deployment Secrets

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `VERCEL_TOKEN` | Vercel API token for deployments | [Vercel Dashboard](https://vercel.com/account/tokens) → Create Token |
| `VERCEL_ORG_ID` | Your Vercel organization ID | Run `vercel ls` or check project settings |
| `VERCEL_PROJECT_ID` | Your Vercel project ID | Project Settings → General → Project ID |
| `VERCEL_PROD_URL` | Production URL | `https://your-app.vercel.app` |

### Application Secrets

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `API_KEY` | MCP API authentication key | `industrial-mcp-2024-secure-key-xyz789` |
| `MAC_ADDRESS` | Authorized device MAC address | `84:94:37:e4:24:88` |

### Optional Secrets

| Secret Name | Description | Usage |
|-------------|-------------|-------|
| `NEO4J_URI` | Neo4j database URI | Future database integration |
| `NEO4J_USERNAME` | Neo4j username | Future database integration |
| `NEO4J_PASSWORD` | Neo4j password | Future database integration |

## Setup Instructions

1. **Get Vercel Information:**
   ```bash
   # Install Vercel CLI if not already installed
   npm i -g vercel
   
   # Login and link your project
   vercel login
   vercel link
   
   # Get your org and project IDs
   vercel ls
   ```

2. **Add Secrets to GitHub:**
   - Go to your repository on GitHub
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Add each secret from the table above

3. **Test the Pipeline:**
   - Create a PR to trigger PR checks
   - Merge to main to trigger deployment

## Security Notes

- Never commit these values to your repository
- Rotate tokens periodically
- Use environment-specific keys when possible
- Monitor secret usage in Actions logs