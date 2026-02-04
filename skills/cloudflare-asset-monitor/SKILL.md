---
name: cloudflare-asset-monitor
description: Use when need to discover, monitor, or track Cloudflare assets (Workers, R2, D1, DO, KV) across projects with usage metrics and alerts
---

# Cloudflare Asset Monitor

Discover and monitor all Cloudflare assets with automated metrics collection, historical tracking, and alerting.

## Overview

Provides centralized monitoring for:
- Workers (requests, CPU, errors)
- R2 buckets (storage, operations)
- D1 databases (queries, storage)
- Durable Objects (instances, requests)
- KV namespaces (operations)

**Key Features:**
- Automatic asset discovery
- Every 5-minute monitoring
- Historical data (1000 snapshots per asset)
- Uptime tracking (24h/7d/30d)
- Cost estimation
- Discord alerts on thresholds

## When to Use

**Monitor when:**
- Managing multiple CF projects
- Need usage visibility
- Cost optimization priority
- Want proactive alerts
- Historical trend analysis needed

**Don't use when:**
- Single simple project
- Real-time monitoring required (<5min)
- Custom metrics needed (not supported by CF API)

## Quick Reference

### Deployment
```bash
cd skills/cloudflare-asset-monitor

# Set secrets
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put DISCORD_WEBHOOK_URL  # optional

# Deploy
npx wrangler deploy
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | All assets status |
| `GET /health/:service` | Specific service health |
| `GET /history/:service` | Historical metrics |
| `GET /alerts` | Active/recent alerts |

### Example Usage
```bash
# Check all assets
curl https://monitor.workers.dev/health

# Specific service
curl https://monitor.workers.dev/health/kiamichi-main

# History with limit
curl https://monitor.workers.dev/history/devflo-workspace?limit=50
```

## Implementation

### Worker Architecture

**Scheduled Task (every 5 min):**
1. Discover assets via Cloudflare API
2. Collect metrics for each
3. Store snapshots in Durable Object
4. Check alert thresholds
5. Send notifications if needed

**Durable Object:**
- Stores historical snapshots
- Calculates uptime
- Prunes old data (>1000 snapshots)
- Serves API queries

### Asset Discovery

**Cloudflare API Endpoints Used:**
```typescript
// Workers
GET /accounts/:id/workers/scripts

// R2 Buckets
GET /accounts/:id/r2/buckets

// D1 Databases
GET /accounts/:id/d1/database

// KV Namespaces
GET /accounts/:id/storage/kv/namespaces

// Durable Objects
GET /accounts/:id/workers/durable_objects/namespaces
```

### Metrics Collected

**Workers:**
- Request count
- CPU milliseconds
- Error count
- Error rate

**R2:**
- Object count
- Storage size (MB)
- Read operations
- Write operations

**D1:**
- Query count
- Rows read/written
- Storage size

### Project Categorization

Automatically derives project from asset naming:
```typescript
// Examples
"kiamichi-main" → project: "kiamichi"
"devflo-workspace-prod" → project: "devflo"
"twisted-custom-leather" → project: "twisted-custom-leather"
```

### Alerting

**Default Rules:**
```typescript
[
  {
    metric: 'errorRate',
    condition: 'gt',
    threshold: 0.05,  // 5%
    action: 'discord'
  },
  {
    metric: 'storageMB',
    condition: 'gt',
    threshold: 10000,  // 10GB
    action: 'log'
  }
]
```

**Alert Actions:**
- `log`: Console only
- `discord`: Webhook notification
- `telegram`: Bot message

### Cost Estimation

**Cloudflare Pricing (2026):**
```typescript
Workers:
  - Requests: $0.15 per 1M
  - CPU: $0.02 per 1M ms

R2:
  - Storage: $0.015 per GB/month
  - Class A ops: $4.50 per 1M (write/list)
  - Class B ops: $0.36 per 1M (read)

D1:
  - Rows read: $0.001 per 1M
  - Rows written: $1.00 per 1M
  - Storage: $0.75 per GB
```

## API Response Formats

### GET /health
```json
{
  "timestamp": 1707024000000,
  "services": [
    {
      "name": "kiamichi-main",
      "type": "worker",
      "status": "healthy",
      "latency": 45,
      "uptime24h": 99.8
    }
  ],
  "summary": {
    "total": 15,
    "healthy": 14,
    "degraded": 1,
    "down": 0
  }
}
```

### GET /health/:service
```json
{
  "name": "kiamichi-business-agent",
  "type": "worker",
  "status": "healthy",
  "latency": 67,
  "lastCheck": 1707024000000,
  "uptime": {
    "24h": 99.5,
    "7d": 99.8,
    "30d": 99.9
  },
  "recentIncidents": []
}
```

### GET /history/:service?limit=10
```json
{
  "service": "kiamichi-main",
  "checks": [
    { "timestamp": 1707024000000, "status": "healthy", "latency": 45 },
    { "timestamp": 1707023700000, "status": "healthy", "latency": 52 }
  ],
  "uptime": {
    "24h": 99.8,
    "7d": 99.9,
    "30d": 99.95
  }
}
```

### GET /alerts
```json
{
  "active": [
    {
      "id": "alert-123",
      "service": "kiamichi-facebook",
      "condition": "status eq down",
      "since": 1707020000000,
      "duration": 180
    }
  ],
  "recent": [
    {
      "id": "alert-122",
      "service": "devflo-moltworker",
      "resolved": 1707019000000
    }
  ]
}
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| API token missing | Set CLOUDFLARE_API_TOKEN secret |
| No assets discovered | Verify account ID matches |
| High storage usage | Increase prune threshold or reduce retention |
| Missing metrics | Check CF Analytics API access |
| Alerts not firing | Verify Discord webhook URL |
| 404 for service | Asset name must match exactly (case-sensitive) |

## Configuration

### wrangler.toml
```toml
name = "cloudflare-asset-monitor"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "ASSET_MONITOR"
class_name = "AssetMonitorDO"

[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes

# Optional: Adjust monitoring frequency
# crons = ["*/15 * * * *"]  # Every 15 minutes
```

### Custom Alert Rules

Edit worker code to add rules:
```typescript
const customRules: AlertRule[] = [
  {
    metric: 'requests',
    condition: 'gt',
    threshold: 1000000,  // 1M requests
    action: 'telegram',
    duration: 300  // Sustained 5 minutes
  }
];
```

## Real-World Impact

**Atlas Infrastructure:**
- 15+ assets monitored
- 288 snapshots/day per asset
- <1MB storage per asset/month
- ~$0.50/month total cost
- **Value:** Proactive issue detection, cost insights

**Typical Findings:**
- Unused R2 buckets consuming storage
- Workers with high error rates
- D1 databases needing optimization
- Cost attribution by project

## Troubleshooting

**No metrics appearing:**
1. Check cron trigger is active: `wrangler deployments list`
2. Verify API token has read permissions
3. Check DO storage: Query via /history endpoint

**High costs:**
1. Reduce cron frequency (15 min vs 5 min)
2. Lower snapshot retention (<1000)
3. Disable unused asset types

**Alerts not working:**
1. Verify webhook URL is valid
2. Check Discord server permissions
3. Test manually: `curl -X POST <webhook> -d '{"content":"test"}'`

## Next Steps

1. Deploy worker
2. Wait 5 minutes for first snapshot
3. Query /health to verify
4. Set up Discord webhook (optional)
5. Monitor costs in CF dashboard

---

**Status:** Production-ready
**Cost:** ~$0.50/month for 15 assets
**Retention:** 1000 snapshots per asset (~84 hours @ 5min intervals)
**Frequency:** Every 5 minutes (configurable)
