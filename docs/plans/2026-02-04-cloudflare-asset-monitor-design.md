# Cloudflare Asset Monitor - Detailed Design

**Date:** 2026-02-04
**Priority:** 1 of 3
**Complexity:** Medium
**Value:** High (new capability)

---

## Problem Statement

Atlas infrastructure uses multiple Cloudflare resources across several projects:
- 7+ Workers (KBC, TCL, SrvcFlo, DevFlo, Blog, etc.)
- 10+ R2 buckets (workspaces, images, business assets, blog)
- 5+ D1 databases
- Multiple Durable Objects
- KV namespaces

**Pain Points:**
- No centralized view of all assets
- Usage patterns invisible until billing
- Can't track costs per project
- No alerts for anomalies or thresholds
- Manual checking across dashboard sections

---

## Goals

### Primary
1. **Discover** all Cloudflare assets across account
2. **Monitor** usage metrics (requests, storage, compute)
3. **Track** costs and identify optimization opportunities
4. **Alert** on anomalies or threshold violations

### Secondary
5. Store historical data for trend analysis
6. Generate reports for cost allocation
7. API for programmatic access

---

## Architecture

### Worker + Durable Object Pattern

**Why Worker?**
- Cron trigger for scheduled monitoring
- Edge compute for fast API responses
- Zero cold start costs

**Why Durable Object?**
- Persistent storage for historical data
- Aggregation and analysis logic
- Single source of truth per asset type

**Data Flow:**
```
Cron (every 5 min)
  → Worker fetches Cloudflare API
  → Parse and normalize metrics
  → Store in Durable Object
  → Check thresholds
  → Send alerts if needed
```

### Asset Types to Monitor

1. **Workers**
   - Request count
   - CPU time
   - Errors
   - Success rate

2. **R2 Buckets**
   - Object count
   - Storage size
   - Read/write operations
   - Bandwidth

3. **D1 Databases**
   - Query count
   - Rows read/written
   - Storage size

4. **Durable Objects**
   - Active instances
   - Request count
   - CPU time

5. **KV Namespaces**
   - Key count
   - Read/write operations
   - Storage size

---

## Implementation Plan

### Phase 1: Discovery & Data Model

**Cloudflare API Endpoints:**
```
GET /accounts/:id/workers/scripts
GET /accounts/:id/r2/buckets
GET /accounts/:id/d1/databases
GET /accounts/:id/durable_objects/namespaces
GET /accounts/:id/storage/kv/namespaces
```

**Durable Object Schema:**
```typescript
interface AssetSnapshot {
  assetId: string;
  assetType: 'worker' | 'r2' | 'd1' | 'do' | 'kv';
  projectName: string; // Derived from naming convention
  timestamp: number;
  metrics: Record<string, number>;
}

interface AssetHistory {
  assetId: string;
  snapshots: AssetSnapshot[];
  alerts: Alert[];
}
```

### Phase 2: Worker Implementation

**worker.ts:**
```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Fetch all asset types from Cloudflare API
    const assets = await discoverAssets(env.CLOUDFLARE_API_TOKEN);
    
    // Store metrics in Durable Objects
    const monitorDO = env.ASSET_MONITOR.get(env.ASSET_MONITOR.idFromName('monitor'));
    await monitorDO.fetch('/store', {
      method: 'POST',
      body: JSON.stringify(assets)
    });
    
    // Check thresholds and alert
    await checkThresholds(assets, env);
  },
  
  async fetch(request: Request, env: Env): Promise<Response> {
    // API endpoints for querying metrics
    const url = new URL(request.url);
    
    if (url.pathname === '/api/assets') {
      // Return current state of all assets
    }
    
    if (url.pathname === '/api/project/:name') {
      // Return metrics for specific project
    }
    
    if (url.pathname === '/api/costs') {
      // Estimated costs based on usage
    }
    
    if (url.pathname === '/api/alerts') {
      // Active alerts
    }
  }
};
```

### Phase 3: Threshold & Alerting

**Threshold Configuration:**
```typescript
interface Threshold {
  assetType: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq';
  value: number;
  action: 'log' | 'discord' | 'telegram';
}

const defaultThresholds: Threshold[] = [
  {
    assetType: 'worker',
    metric: 'errorRate',
    condition: 'gt',
    value: 0.05, // 5% error rate
    action: 'discord'
  },
  {
    assetType: 'r2',
    metric: 'storageMB',
    condition: 'gt',
    value: 10000, // 10GB
    action: 'log'
  }
];
```

**Alert Delivery:**
- Discord webhook for critical alerts
- Telegram for daily summaries
- Logs for everything else

### Phase 4: Cost Estimation

**Cloudflare Pricing (as of 2026):**
```typescript
const pricing = {
  workers: {
    requestsPerMillion: 0.15,
    cpuMsPerMillion: 0.02
  },
  r2: {
    storagePerGB: 0.015,
    classAPerMillion: 4.50, // write, list
    classBPerMillion: 0.36  // read
  },
  d1: {
    rowsReadPerMillion: 0.001,
    rowsWrittenPerMillion: 1.00,
    storagePerGB: 0.75
  },
  workersAI: {
    neuronsPerMillion: 0.011 // Llama 3.1 8B
  }
};

function estimateMonthlyCost(metrics: AssetMetrics): number {
  // Calculate based on current usage + pricing
}
```

---

## Testing Strategy (TDD)

### Test 1: Discovery
```typescript
test('discovers all Workers in account', async () => {
  const assets = await discoverAssets(mockToken);
  expect(assets.workers).toHaveLength(7);
  expect(assets.workers).toContainEqual({
    name: 'kiamichi-business-agent',
    project: 'KBC'
  });
});
```

### Test 2: Metrics Storage
```typescript
test('stores metrics in Durable Object', async () => {
  const snapshot = createSnapshot('worker', 'test-worker', metrics);
  await monitorDO.storeSnapshot(snapshot);
  const retrieved = await monitorDO.getHistory('test-worker');
  expect(retrieved.snapshots).toHaveLength(1);
});
```

### Test 3: Threshold Detection
```typescript
test('detects threshold violation and alerts', async () => {
  const highErrorRate = { errorRate: 0.10 }; // 10% > 5% threshold
  const alerts = await checkThresholds([
    createAsset('worker', 'test', highErrorRate)
  ]);
  expect(alerts).toHaveLength(1);
  expect(alerts[0].message).toContain('error rate exceeded');
});
```

### Test 4: Cost Calculation
```typescript
test('calculates estimated monthly cost', async () => {
  const metrics = {
    requests: 1000000,      // 1M requests
    cpuMs: 500000,          // 500k ms CPU
    storageMB: 1000         // 1GB storage
  };
  const cost = estimateMonthlyCost('worker', metrics);
  expect(cost).toBeCloseTo(0.25, 2); // $0.25
});
```

---

## Deployment Checklist

- [ ] Write tests (all 4+ test cases above)
- [ ] Implement worker.ts with basic discovery
- [ ] Verify tests pass (GREEN)
- [ ] Add Durable Object for persistence
- [ ] Implement threshold checking
- [ ] Add alert delivery (Discord webhook)
- [ ] Deploy to production with cron trigger
- [ ] Verify in dashboard (5 min interval working)
- [ ] Document API endpoints
- [ ] Create SKILL.md for agent usage

---

## Success Criteria

1. **Discovery:** Finds all 7+ Workers, 10+ R2 buckets, D1 databases
2. **Monitoring:** Captures metrics every 5 minutes
3. **Alerting:** Discord notification on error rate > 5%
4. **Cost Tracking:** Accurate estimation within 10% of actual bill
5. **API:** Responds to /api/* endpoints in <100ms

---

## Future Enhancements (V2)

- Web dashboard (canvas visualization)
- Anomaly detection (ML-based)
- Cost forecasting (trend analysis)
- Budget limits and auto-shutoff
- Multi-account support
- Comparison reports (project vs project)

---

**Status:** Design complete, ready for TDD implementation
