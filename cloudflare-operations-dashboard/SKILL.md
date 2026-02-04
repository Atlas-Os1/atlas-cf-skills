

# Cloudflare Operations Dashboard

---
name: cloudflare-operations-dashboard
description: Use when monitoring Cloudflare infrastructure health and costs. Provides unified dashboard for Workers, D1, R2, DO, KV with alerting. Tracks Workers AI usage, calculates costs, forecasts spending.
---

## Overview

Centralized monitoring and cost tracking for all Cloudflare resources across multiple projects. Single Worker providing health metrics, usage analytics, cost breakdowns, and proactive alerts.

**Core Principle:** Visibility prevents problems. Monitor everything, alert intelligently.

## When to Use This Skill

**Triggers:**
- "Check Cloudflare infrastructure health"
- "What are my Cloudflare costs?"
- "Monitor Workers AI usage"
- "Set up alerts for error rates"
- "Show me R2 storage breakdown"
- "How much am I spending on D1?"

**Context Required:**
- Cloudflare API token (read access)
- Cloudflare account ID
- Discord webhook URL (for alerts)
- Projects to monitor (KBC, TCL, SrvcFlo, DevFlo)

## Implementation Guide

### Deployment

**1. Deploy Dashboard Worker**

```bash
cd /home/flo/atlas-cf-skills/cloudflare-operations-dashboard
wrangler deploy
```

**2. Configure Secrets**

```bash
# Cloudflare credentials
wrangler secret put CLOUDFLARE_API_TOKEN
# Paste your API token

wrangler secret put CLOUDFLARE_ACCOUNT_ID
# Paste: ff3c5e2beaea9f85fee3200bfe28da16

# Alert notifications
wrangler secret put DISCORD_WEBHOOK_URL
# Get from Discord Server Settings → Integrations → Webhooks

wrangler secret put TELEGRAM_BOT_TOKEN
# Optional: From @BotFather

wrangler secret put TELEGRAM_CHAT_ID
# Optional: Your Telegram chat ID
```

**3. Access Dashboard**

```bash
# Development
wrangler dev

# Production
https://ops.minte.dev/
```

---

### API Endpoints

#### Overview
```bash
GET /api/overview
# Returns: All resources across all projects

GET /api/overview?project=kiamichi-biz-connect
# Returns: Resources filtered by project
```

#### Worker Health
```bash
GET /api/workers
# List all Workers

GET /api/workers/{name}/health
# Health status + uptime

GET /api/workers/{name}/metrics?timeframe=24h
# Error rate, request count

GET /api/workers/{name}/latency?timeframe=24h
# Response time percentiles (p50, p95, p99)
```

#### D1 Databases
```bash
GET /api/d1
# List all D1 databases

GET /api/d1/{name}/metrics?timeframe=24h
# Query performance, slow queries

GET /api/d1/{name}/storage
# Storage usage, row count, table count
```

#### Durable Objects
```bash
GET /api/durable-objects
# List all DO namespaces

GET /api/durable-objects/{name}/instances
# Active instance count

GET /api/durable-objects/{name}/storage
# Storage usage per instance
```

#### R2 Buckets
```bash
GET /api/r2
# List all buckets

GET /api/r2/{name}/usage
# Storage size, object count
```

#### KV Namespaces
```bash
GET /api/kv
# List all namespaces

GET /api/kv/{name}/metrics?timeframe=24h
# Read/write/delete operations
```

#### Cost Tracking
```bash
GET /api/costs?timeframe=30d
# Total cost breakdown

GET /api/costs/workers-ai?timeframe=30d
# Workers AI token usage + cost

GET /api/costs/r2?timeframe=30d
# R2 storage + operations cost

GET /api/costs/d1?timeframe=30d
# D1 row reads/writes cost

GET /api/costs/forecast
# Next month cost forecast
```

#### Alerts
```bash
GET /api/alerts?timeframe=7d
# Alert history

GET /api/alerts?timeframe=7d&severity=critical
# Filter by severity

POST /api/alerts
# Set custom alert threshold
{
  "metric": "error_rate",
  "threshold": 5,
  "duration": "5m",
  "notification": "discord"
}

POST /api/alerts/test
# Send test alert to verify notifications
```

---

### Usage Examples

#### Example 1: Check Infrastructure Health

```typescript
// Get overview of all resources
const overview = await fetch('https://ops.minte.dev/api/overview')
  .then(r => r.json());

console.log(`Workers: ${overview.workers.length}`);
console.log(`D1 Databases: ${overview.databases.length}`);
console.log(`R2 Buckets: ${overview.r2_buckets.length}`);

// Check specific Worker health
const kbcHealth = await fetch('https://ops.minte.dev/api/workers/kiamichi-biz-connect/health')
  .then(r => r.json());

console.log(`Status: ${kbcHealth.status}`);
console.log(`Uptime: ${kbcHealth.uptime_percent}%`);
```

#### Example 2: Monitor Costs

```typescript
// Get monthly cost breakdown
const costs = await fetch('https://ops.minte.dev/api/costs?timeframe=30d')
  .then(r => r.json());

console.log('Monthly Costs:');
console.log(`  Workers: $${costs.workers}`);
console.log(`  Workers AI: $${costs.workers_ai}`);
console.log(`  R2: $${costs.r2}`);
console.log(`  D1: $${costs.d1}`);
console.log(`  Total: $${costs.total_usd}`);

// Forecast next month
const forecast = await fetch('https://ops.minte.dev/api/costs/forecast')
  .then(r => r.json());

console.log(`Estimated next month: $${forecast.estimated_total_usd}`);
console.log(`Trend: ${forecast.trend_percent > 0 ? '+' : ''}${forecast.trend_percent}%`);
```

#### Example 3: Set Up Alerts

```typescript
// Configure error rate alert
await fetch('https://ops.minte.dev/api/alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    metric: 'error_rate',
    threshold: 5,
    duration: '5m',
    notification: 'discord'
  })
});

// Configure cost spike alert
await fetch('https://ops.minte.dev/api/alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    metric: 'cost_spike',
    threshold: 50, // 50% increase
    notification: 'discord'
  })
});

// Test notifications
await fetch('https://ops.minte.dev/api/alerts/test', { method: 'POST' });
```

---

### Alert Configuration

**Default Alerts:**

| Metric | Threshold | Notification |
|--------|-----------|--------------|
| Error Rate | 5% | Discord |
| Response Time (p95) | 1000ms | Discord |
| Cost Spike | +50% | Discord |
| Quota Usage | 90% | Discord |

**Custom Alerts:**

```typescript
// High Workers AI usage
{
  metric: 'workers_ai_tokens',
  threshold: 10_000_000, // 10M tokens/month
  notification: 'discord'
}

// R2 storage approaching limit
{
  metric: 'r2_storage_gb',
  threshold: 500, // 500GB
  notification: 'telegram'
}

// D1 slow queries
{
  metric: 'd1_slow_queries',
  threshold: 1000, // >1000 slow queries/day
  notification: 'discord'
}
```

---

### Multi-Project Support

**Filter by Project:**

```bash
# All projects
GET /api/overview

# Specific project
GET /api/overview?project=kiamichi-biz-connect
GET /api/overview?project=twisted-custom-leather
GET /api/overview?project=srvcflo
GET /api/overview?project=devflo-moltworker
```

**Project Detection:**

Dashboard auto-detects projects based on Worker/resource naming patterns:
- `kiamichi-*` → KiamichiBizConnect
- `twisted-*` → TwistedCustomLeather
- `srvcflo-*` → SrvcFlo
- `devflo-*` → DevFlo

---

### Dashboard UI

**Access:** `https://ops.minte.dev/`

**Features:**
- Real-time health status
- Cost breakdown (current month)
- Resource inventory
- Alert history
- Auto-refresh every 60 seconds

**Dark Theme:**
- Minimalist design
- Cloudflare orange accents (#ff6b35)
- Responsive layout

---

### Testing Checklist

**Before using in production:**

- [ ] API token has read access to all resources
- [ ] Account ID correct (ff3c5e2beaea9f85fee3200bfe28da16)
- [ ] Discord webhook working (test with `/api/alerts/test`)
- [ ] Overview endpoint returns all projects
- [ ] Worker health metrics accurate
- [ ] Cost calculations match Cloudflare dashboard
- [ ] Alerts trigger correctly
- [ ] Dashboard UI loads and refreshes

---

### Common Pitfalls

**Avoid these mistakes:**

1. **Insufficient API permissions** - Token needs read access to Workers, D1, R2, DO, KV, Analytics
2. **Wrong account ID** - Double-check it matches your Cloudflare account
3. **Missing webhooks** - Alerts won't work without Discord/Telegram configuration
4. **Hardcoded secrets** - Always use `wrangler secret put`, never commit secrets
5. **Ignoring rate limits** - Cloudflare API has rate limits (1200 req/5min)

---

### Troubleshooting

**Dashboard showing 0 resources?**
- Check API token permissions
- Verify account ID is correct
- Check browser console for errors

**Alerts not sending?**
- Test with `/api/alerts/test`
- Verify Discord webhook URL
- Check Worker logs: `wrangler tail`

**Costs seem wrong?**
- Pricing updated in `cost-calculator.ts`
- Cross-reference with Cloudflare billing dashboard
- Remember: Workers AI is $0 (included in plan)

**Slow response times?**
- Analytics API can be slow (30-60s)
- Consider caching results in KV
- Use Durable Object for persistent storage

---

### Monitoring the Monitor

**How to ensure dashboard itself is healthy:**

```bash
# Check dashboard uptime
curl https://ops.minte.dev/api/overview

# Monitor dashboard logs
wrangler tail cloudflare-ops-dashboard

# Set up external monitoring (UptimeRobot, etc.)
# Monitor: https://ops.minte.dev/api/overview
# Interval: 5 minutes
# Alert if: Response time >10s OR HTTP status ≠200
```

---

**Remember:** This dashboard monitors ALL your Cloudflare infrastructure. Keep it secure (no public write access), reliable (monitor the monitor), and up-to-date (pricing changes quarterly).

Use it daily to prevent problems before they become incidents.
