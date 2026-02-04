---
name: cf-sync-monitor  
description: Monitor R2 backup sync health by checking timestamps and file counts. Use when verifying workspace persistence or debugging sync issues.
---

# CF Sync Monitor

Monitors R2 backup sync health with alerting.

## Endpoints
- `GET /health` - Check sync status

## Response Format
\`\`\`json
{
  "healthy": true,
  "lastSync": "2026-02-04T07:00:00.000Z",
  "minutesSinceSync": 5,
  "fileCount": 42,
  "issues": []
}
\`\`\`

## Configuration
| Var | Description | Default |
|-----|-------------|---------|
| `STALE_THRESHOLD_MINUTES` | Minutes before sync is stale | 10 |
| `ALERT_WEBHOOK` | URL to POST alerts | - |
