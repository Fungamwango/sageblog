#!/bin/bash
set -e

ACCOUNT_ID="9f814249d80baa3f7fc398a840a8508b"
DB_ID="d14f71cb-83e6-41cd-8038-0a6afea736ad"
TOKEN_FILE="/c/Users/pc/AppData/Roaming/xdg.config/.wrangler/config/default.toml"

echo "🚀 Deploying frontend..."
npx wrangler pages deploy public --project-name sageblog-frontend

echo "🔗 Re-applying D1 binding..."
TOKEN=$(grep 'oauth_token' "$TOKEN_FILE" | cut -d'"' -f2)

curl -s -X PATCH "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/sageblog-frontend" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"deployment_configs\":{\"production\":{\"d1_databases\":{\"DB\":{\"id\":\"${DB_ID}\"}}},\"preview\":{\"d1_databases\":{\"DB\":{\"id\":\"${DB_ID}\"}}}}}" \
  | grep -o '"success":true' && echo "Binding applied ✓" || echo "⚠️  Check binding manually"

echo "✅ Done — sitemap D1 binding active"
