# SageBlog Deployment Guide

## Prerequisites
- Node.js 18+
- Cloudflare account with Workers, D1, KV, AI enabled
- `npm install -g wrangler` then `wrangler login`

---

## Step 1: Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create sageblog-db
# → Copy the database_id to worker/wrangler.toml

# Create KV namespace
wrangler kv:namespace create KV_STORE
# → Copy the id to worker/wrangler.toml
```

---

## Step 2: Update worker/wrangler.toml

Replace these placeholders:
- `REPLACE_WITH_YOUR_D1_ID` → your D1 database_id
- `REPLACE_WITH_YOUR_KV_ID` → your KV namespace id

---

## Step 3: Initialize Database

```bash
cd worker
npm install

# Run schema against D1 (remote)
wrangler d1 execute sageblog-db --file=../schema/schema.sql --remote
```

---

## Step 4: Set Secrets

```bash
wrangler secret put JWT_SECRET
# Enter a long random string (e.g. openssl rand -base64 32)

wrangler secret put ADMIN_SECRET
# Enter a secret you'll use to create the admin account
```

---

## Step 5: Deploy Worker

```bash
cd worker
wrangler deploy
```

The Worker will be live at `sageblog-api.<your-subdomain>.workers.dev`.

---

## Step 6: Configure Custom Domain for Worker

In Cloudflare Dashboard:
1. Go to Workers & Pages → sageblog-api → Settings → Domains & Routes
2. Add custom domain: `api.sageblog.cfd`

Or add to wrangler.toml routes section (already configured).

---

## Step 7: Deploy Frontend

```bash
cd frontend

# Option A: Wrangler CLI
wrangler pages deploy public --project-name sageblog-frontend

# Option B: Connect GitHub repo in Cloudflare Pages Dashboard
# → Build output: public/
# → No build command needed
```

In Cloudflare Pages Dashboard:
1. Add custom domain: `sageblog.cfd`

---

## Step 8: Create Admin Account

```bash
curl -X POST https://api.sageblog.cfd/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@sageblog.cfd","password":"YOUR_STRONG_PASSWORD","admin_secret":"YOUR_ADMIN_SECRET"}'
```

---

## Step 9: Generate First Posts

Visit `https://sageblog.cfd/admin`, sign in as admin, go to **Generate Posts**, and trigger generation for each category.

Posts are also auto-generated every 6 hours via cron.

---

## Cloudflare DNS Setup

| Type  | Name | Content                        | Proxy |
|-------|------|--------------------------------|-------|
| CNAME | @    | sageblog-frontend.pages.dev    | ✓     |
| CNAME | api  | (auto-set when adding Worker route) | ✓ |

---

## Environment Summary

| Resource | Name | Purpose |
|----------|------|---------|
| Worker | sageblog-api | API backend + AI generation |
| Pages | sageblog-frontend | Static frontend |
| D1 | sageblog-db | Posts, users, comments, likes |
| KV | KV_STORE | Rate limiting + refresh tokens + cron state |
| Workers AI | — | LLaMA 3.1 8B for blog generation |
| Cron | 0 */6 * * * | Auto-generate 1 post every 6 hours |
