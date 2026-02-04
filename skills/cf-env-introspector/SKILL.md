---
name: cf-env-introspector
description: Standardized environment introspection for CF Workers. Use when auditing bindings, checking capabilities, or generating environment reports.
---

# CF Environment Introspector

Provides `/introspect` endpoint for environment analysis.

## Endpoints
- `GET /introspect` - Environment report

## Response Format
\`\`\`json
{
  "timestamp": "2026-02-04T07:00:00.000Z",
  "runtime": "cloudflare-workers",
  "bindings": [{ "name": "DB", "type": "D1" }],
  "secrets": ["ANTHROPIC_API_KEY"],
  "vars": { "ENVIRONMENT": "production" },
  "capabilities": ["D1 Database", "Workers AI"]
}
\`\`\`

## Security
- **Never exposes secret values** - only names
- Detects common secret patterns: API_KEY, TOKEN, SECRET, PASSWORD
