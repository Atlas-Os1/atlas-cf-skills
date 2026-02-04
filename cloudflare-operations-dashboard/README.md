# Cloudflare Operations Dashboard

Unified monitoring and cost tracking for all Cloudflare resources.

## Overview

**Goal:** Single dashboard showing health + costs across all projects

**What it monitors:**
- ✅ Workers (uptime, errors, latency)
- ✅ D1 Databases (queries, storage, performance)
- ✅ Durable Objects (instances, storage, requests)
- ✅ R2 Buckets (storage, egress, operations)
- ✅ KV Namespaces (reads, writes, storage)
- ✅ Workers AI (token usage, cost)

**What it does:**
- Real-time health monitoring
- Cost breakdown and forecasting
- Proactive alerts (Discord, Telegram)
- Multi-project support (KBC, TCL, SrvcFlo, DevFlo)

## Quick Start

### 1. Deploy

```bash
cd /home/flo/atlas-cf-skills/cloudflare-operations-dashboard
wrangler deploy
```

### 2. Configure

```bash
# Required
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID

# Optional (for alerts)
wrangler secret put DISCORD_WEBHOOK_URL
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

### 3. Access

**Dashboard UI:**
```
https://ops.minte.dev/
```

**API:**
```bash
curl https://ops.minte.dev/api/overview
curl https://ops.minte.dev/api/costs?timeframe=30d
```

## API Endpoints

### Health Monitoring

```
GET /api/overview - All resources
GET /api/workers - List Workers
GET /api/workers/{name}/health - Worker health
GET /api/workers/{name}/metrics?timeframe=24h - Worker metrics
GET /api/d1 - List D1 databases
GET /api/d1/{name}/metrics?timeframe=24h - D1 metrics
GET /api/r2 - List R2 buckets
GET /api/r2/{name}/usage - R2 usage
```

### Cost Tracking

```
GET /api/costs?timeframe=30d - Total costs
GET /api/costs/workers-ai?timeframe=30d - Workers AI usage
GET /api/costs/r2?timeframe=30d - R2 costs
GET /api/costs/d1?timeframe=30d - D1 costs
GET /api/costs/forecast - Next month forecast
```

### Alerts

```
GET /api/alerts?timeframe=7d - Alert history
POST /api/alerts - Configure alert
POST /api/alerts/test - Send test alert
```

## Cost Calculations

**Cloudflare Pricing (2026):**

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Workers | 100K req/day | $0.30/M requests |
| Workers AI | N/A | Included in plan ($0) |
| R2 Storage | N/A | $0.015/GB/month |
| R2 Egress | N/A | $0 (zero egress!) |
| D1 | 5M reads, 100K writes | $0.001/M reads |
| Durable Objects | N/A | $0.15/M requests |
| KV | 100K reads, 1K writes | $0.50/M reads |

**Example Monthly Cost:**

```json
{
  "workers": 0.50,
  "workers_ai": 0,
  "r2": 0.81,
  "d1": 0.15,
  "durable_objects": 0.30,
  "kv": 0.10,
  "total_usd": 1.86
}
```

## Alert Configuration

**Default Alerts:**

```typescript
{
  error_rate: 5%,
  response_time_p95: 1000ms,
  cost_spike: +50%,
  quota_usage: 90%
}
```

**Custom Alerts:**

```bash
curl -X POST https://ops.minte.dev/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "metric": "error_rate",
    "threshold": 5,
    "duration": "5m",
    "notification": "discord"
  }'
```

## Multi-Project Support

**Projects:**
- KiamichiBizConnect (kiamichi-*)
- TwistedCustomLeather (twisted-*)
- SrvcFlo (srvcflo-*)
- DevFlo (devflo-*)

**Filter by project:**

```bash
curl https://ops.minte.dev/api/overview?project=kiamichi-biz-connect
```

## Dashboard UI

**Features:**
- Real-time health status
- Cost breakdown (current month)
- Resource inventory
- Alert history
- Auto-refresh (60s)

**Dark Theme:**
- Minimalist design
- Cloudflare orange (#ff6b35)
- Responsive layout

## Files

```
cloudflare-operations-dashboard/
├── SKILL.md                    # Agent instructions
├── README.md                   # This file (human docs)
├── src/
│   ├── index.ts                # Main Worker
│   ├── cloudflare-api.ts       # API client
│   ├── cost-calculator.ts      # Cost calculations
│   └── alert-manager.ts        # Alerts + notifications
├── tests/
│   └── dashboard.test.ts       # Test suite
└── wrangler.toml               # Worker config
```

## Testing

```bash
# Run tests
npm test

# Test locally
wrangler dev

# Test alerts
curl -X POST https://ops.minte.dev/api/alerts/test
```

## Troubleshooting

### Dashboard showing 0 resources?
- Check API token permissions (needs read access)
- Verify account ID: `ff3c5e2beaea9f85fee3200bfe28da16`
- Check browser console for errors

### Alerts not sending?
- Test with `/api/alerts/test`
- Verify Discord webhook URL
- Check Worker logs: `wrangler tail`

### Costs seem wrong?
- Cross-reference with Cloudflare billing dashboard
- Remember: Workers AI is $0 (included in plan)
- Pricing in `cost-calculator.ts` may need updates

### Slow response times?
- Analytics API can be slow (30-60s)
- Consider caching results in KV
- Use Durable Object for persistent storage

## Monitoring the Monitor

**External monitoring recommended:**

```yaml
Service: UptimeRobot (or similar)
URL: https://ops.minte.dev/api/overview
Interval: 5 minutes
Alert if: Response time >10s OR HTTP status ≠200
```

**Log monitoring:**

```bash
wrangler tail cloudflare-ops-dashboard --format pretty
```

## Support

**Issues:** https://github.com/Atlas-Os1/atlas-cf-skills/issues
**Docs:** See SKILL.md for detailed agent instructions
**Minte:** Message in Discord #dev-team channel

---

**Built with 🌩️ by Atlas-OS**
