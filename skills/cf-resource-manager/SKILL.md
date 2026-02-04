---
name: cf-resource-manager
description: Query Cloudflare resources (D1, R2, KV) via REST API without wrangler CLI. Use when checking binding status, listing resources, or verifying CF infrastructure health.
---

# CF Resource Manager

REST API for querying Cloudflare resource bindings status.

## Endpoints
- `GET /resources` - List all configured bindings and their status

## Response Format
\`\`\`json
{
  "resources": [
    { "type": "D1", "name": "DB", "status": "connected" },
    { "type": "R2", "name": "BUCKET", "status": "connected" }
  ]
}
\`\`\`

## Authentication
Set `API_TOKEN` secret. Include `Authorization: Bearer <token>` header.
