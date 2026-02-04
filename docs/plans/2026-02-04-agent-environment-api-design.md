# Agent Environment API - Detailed Design

**Date:** 2026-02-04
**Priority:** 3 of 3
**Complexity:** Medium
**Value:** High (operational excellence)

---

## Problem Statement

**Flo's Perspective (VPS):**
- No centralized health monitoring for Workers
- Manual checking across Cloudflare dashboard
- Can't programmatically query service status
- No historical uptime tracking

**DevFlo's Perspective (Container):**
- Manual environment audit each session
- No standardized introspection API
- Wrangler auth issues prevent CF queries
- No visibility into container resource usage

**Combined Need:**
- Unified API for both agent health checks AND environment introspection
- Programmatic access from agents without manual dashboard checks
- Historical data for trend analysis
- Alerts on anomalies

---

## Goals

### Primary
1. **Health Monitoring** - Check status of all Workers, R2, D1, DO
2. **Environment Introspection** - Standardized `/introspect` endpoint for agent context
3. **Historical Tracking** - Store health data over time
4. **Alerting** - Notify on failures or anomalies

### Secondary
5. Resource usage tracking (CPU, memory, requests)
6. Cost attribution per project
7. SLA monitoring (uptime %)
8. Incident timeline

---

## Architecture

### Worker + Durable Object Pattern

**Why One Worker for Both?**
- Shared infrastructure (health checks + introspection)
- Single deployment and maintenance
- Unified data model

**Components:**
```
Agent Environment API Worker
├── /health              - Service health checks
├── /health/:service     - Specific service status
├── /introspect          - Current agent environment
├── /introspect/:agent   - Specific agent context
├── /history/:service    - Historical health data
└── /alerts              - Active alerts
```

---

## Implementation Plan

### Phase 1: Health Check System

**Health Check Logic:**
```typescript
interface ServiceHealth {
  name: string;
  type: 'worker' | 'r2' | 'd1' | 'do' | 'kv';
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  lastCheck: number;
  metadata: Record<string, any>;
}

async function checkWorkerHealth(workerName: string): Promise<ServiceHealth> {
  const start = Date.now();
  
  try {
    const response = await fetch(`https://${workerName}.workers.dev/health`);
    const latency = Date.now() - start;
    
    if (!response.ok) {
      return {
        name: workerName,
        type: 'worker',
        status: 'degraded',
        latency,
        lastCheck: Date.now(),
        metadata: { statusCode: response.status }
      };
    }
    
    return {
      name: workerName,
      type: 'worker',
      status: 'healthy',
      latency,
      lastCheck: Date.now(),
      metadata: {}
    };
  } catch (error) {
    return {
      name: workerName,
      type: 'worker',
      status: 'down',
      latency: Date.now() - start,
      lastCheck: Date.now(),
      metadata: { error: error.message }
    };
  }
}
```

**Monitored Services:**
```typescript
const services = [
  // Workers
  { name: 'kiamichi-main', url: 'https://kiamichibizconnect.com' },
  { name: 'kiamichi-business-agent', url: 'https://app.kiamichibizconnect.com' },
  { name: 'kiamichi-analyzer', url: 'https://analyzer.kiamichibizconnect.com' },
  { name: 'kiamichi-facebook', url: 'https://facebook.kiamichibizconnect.com' },
  { name: 'twisted-custom-leather', url: 'https://twistedcustomleather.com' },
  { name: 'srvcflo-main', url: 'https://srvcflo.com' },
  { name: 'minte-blog', url: 'https://blog.minte.dev' },
  { name: 'devflo-moltworker', url: 'https://devflo-moltworker.srvcflo.workers.dev' },
  
  // R2 (via GET request)
  { name: 'kiamichi-biz-images', type: 'r2' },
  { name: 'devflo-workspace-prod', type: 'r2' },
  { name: 'minte-blog-prod', type: 'r2' },
  
  // D1 (via query)
  { name: 'kiamichi-biz-connect-db', type: 'd1' }
];
```

### Phase 2: Environment Introspection

**Introspection Data Model:**
```typescript
interface AgentEnvironment {
  agent: 'flo' | 'devflo' | 'rooty';
  timestamp: number;
  runtime: {
    platform: 'vps' | 'container' | 'local';
    kernel: string;
    node: string;
    memory: {
      total: number;
      available: number;
      used: number;
    };
    disk: {
      total: number;
      available: number;
      used: number;
    };
  };
  cloudflare: {
    authenticated: boolean;
    account?: string;
    workers: string[];
    r2Buckets: string[];
    d1Databases: string[];
  };
  github: {
    authenticated: boolean;
    user?: string;
    repos: string[];
  };
  capabilities: {
    browserRendering: boolean;
    workersAI: boolean;
    durableObjects: boolean;
    r2: boolean;
    d1: boolean;
  };
  activeProcesses: number;
  cronJobs: number;
  skills: number;
}
```

**Introspection Logic:**
```typescript
async function introspectEnvironment(agent: string): Promise<AgentEnvironment> {
  const isContainer = await checkIfContainer();
  
  if (isContainer) {
    // DevFlo container introspection
    return {
      agent: 'devflo',
      timestamp: Date.now(),
      runtime: await getContainerRuntime(),
      cloudflare: await checkCloudflareAccess(),
      github: await checkGitHubAccess(),
      capabilities: {
        browserRendering: true,
        workersAI: true,
        durableObjects: true,
        r2: true,
        d1: true
      },
      activeProcesses: await getProcessCount(),
      cronJobs: 0, // Container doesn't have cron
      skills: await getSkillCount()
    };
  } else {
    // Flo VPS introspection
    return {
      agent: 'flo',
      timestamp: Date.now(),
      runtime: await getVPSRuntime(),
      cloudflare: await checkCloudflareAccess(),
      github: await checkGitHubAccess(),
      capabilities: {
        browserRendering: false,
        workersAI: false,
        durableObjects: false,
        r2: true,
        d1: false
      },
      activeProcesses: await getProcessCount(),
      cronJobs: await getCronJobCount(),
      skills: await getSkillCount()
    };
  }
}
```

### Phase 3: Historical Data & Durable Objects

**Storage Schema:**
```typescript
class HealthHistoryDO {
  async storeHealthCheck(service: string, health: ServiceHealth) {
    const key = `health:${service}:${Date.now()}`;
    await this.state.storage.put(key, health);
    
    // Keep last 1000 checks per service
    await this.pruneOldChecks(service, 1000);
  }
  
  async getHealthHistory(service: string, limit: number = 100) {
    const prefix = `health:${service}:`;
    const checks = await this.state.storage.list({ prefix, limit });
    return Array.from(checks.values());
  }
  
  async calculateUptime(service: string, hours: number = 24) {
    const since = Date.now() - (hours * 60 * 60 * 1000);
    const checks = await this.getHealthHistory(service, 1000);
    
    const relevant = checks.filter(c => c.lastCheck >= since);
    const healthy = relevant.filter(c => c.status === 'healthy');
    
    return (healthy.length / relevant.length) * 100;
  }
}
```

### Phase 4: Alerting System

**Alert Conditions:**
```typescript
interface AlertRule {
  service: string;
  condition: 'status' | 'latency' | 'uptime';
  operator: 'eq' | 'gt' | 'lt';
  threshold: any;
  duration?: number; // Sustained for X seconds
  action: 'log' | 'discord' | 'telegram';
}

const defaultRules: AlertRule[] = [
  {
    service: '*',
    condition: 'status',
    operator: 'eq',
    threshold: 'down',
    duration: 300, // 5 minutes
    action: 'discord'
  },
  {
    service: 'kiamichi-business-agent',
    condition: 'latency',
    operator: 'gt',
    threshold: 1000, // 1 second
    duration: 60,
    action: 'log'
  },
  {
    service: '*',
    condition: 'uptime',
    operator: 'lt',
    threshold: 95, // 95% uptime
    duration: 3600, // Over 1 hour
    action: 'telegram'
  }
];
```

**Alert Delivery:**
```typescript
async function sendAlert(alert: Alert, env: Env) {
  const message = formatAlertMessage(alert);
  
  switch (alert.action) {
    case 'discord':
      await env.DISCORD.send(message);
      break;
    case 'telegram':
      await env.TELEGRAM.send(message);
      break;
    case 'log':
      console.log('ALERT:', message);
      break;
  }
}

function formatAlertMessage(alert: Alert): string {
  return `🚨 **Alert: ${alert.service}**
Status: ${alert.status}
Condition: ${alert.condition} ${alert.operator} ${alert.threshold}
Duration: ${alert.duration}s
Time: ${new Date(alert.timestamp).toISOString()}`;
}
```

---

## API Endpoints

### Health Endpoints

**GET /health**
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
    },
    {
      "name": "devflo-workspace-prod",
      "type": "r2",
      "status": "healthy",
      "latency": 12,
      "uptime24h": 100.0
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

**GET /health/:service**
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
  "recentIncidents": [
    {
      "timestamp": 1707020000000,
      "status": "degraded",
      "duration": 180,
      "reason": "High latency (>1000ms)"
    }
  ]
}
```

### Introspection Endpoints

**GET /introspect**
```json
{
  "agent": "flo",
  "platform": "vps",
  "runtime": {
    "node": "v22.22.0",
    "kernel": "6.14.0-34-generic",
    "memory": { "total": 103079215104, "available": 54760038400, "used": 48319176704 }
  },
  "cloudflare": {
    "authenticated": true,
    "workers": ["kiamichi-main", "twisted-custom-leather"],
    "r2Buckets": ["devflo-workspace-prod", "minte-blog-prod"]
  },
  "capabilities": {
    "browserRendering": false,
    "workersAI": false,
    "r2": true
  }
}
```

**GET /introspect/:agent**
- Same as above but for specific agent (flo, devflo, rooty)

### History Endpoints

**GET /history/:service**
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

### Alert Endpoints

**GET /alerts**
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

---

## Testing Strategy (TDD)

### Test 1: Health Check
```typescript
test('checks worker health successfully', async () => {
  const health = await checkWorkerHealth('kiamichi-main');
  expect(health.status).toBe('healthy');
  expect(health.latency).toBeLessThan(1000);
});
```

### Test 2: Introspection
```typescript
test('introspects VPS environment', async () => {
  const env = await introspectEnvironment('flo');
  expect(env.agent).toBe('flo');
  expect(env.runtime.platform).toBe('vps');
  expect(env.capabilities.r2).toBe(true);
});
```

### Test 3: Historical Data
```typescript
test('stores and retrieves health history', async () => {
  const healthDO = getHealthDO();
  await healthDO.storeHealthCheck('test-service', mockHealth);
  const history = await healthDO.getHealthHistory('test-service');
  expect(history).toHaveLength(1);
});
```

### Test 4: Alerting
```typescript
test('triggers alert on service down', async () => {
  const downHealth = { status: 'down', service: 'test' };
  const alerts = await checkAlertRules(downHealth);
  expect(alerts).toHaveLength(1);
  expect(alerts[0].action).toBe('discord');
});
```

---

## Deployment Checklist

- [ ] Write all tests (4+ test cases)
- [ ] Implement health check logic
- [ ] Verify tests pass (GREEN)
- [ ] Add introspection endpoints
- [ ] Implement Durable Object for history
- [ ] Add alerting system
- [ ] Deploy with cron trigger (every 5 min)
- [ ] Test from both Flo and DevFlo
- [ ] Verify Discord/Telegram alerts work
- [ ] Document API endpoints
- [ ] Create SKILL.md for agent usage

---

## Success Criteria

1. **Health Checks:** All 15+ services monitored every 5 minutes
2. **Introspection:** Both agents can query environment in <100ms
3. **Uptime Tracking:** 30-day historical data available
4. **Alerts:** Discord notification within 60s of service down
5. **API Performance:** p95 < 200ms for all endpoints

---

## Future Enhancements

- Web dashboard (canvas visualization)
- Anomaly detection (ML-based patterns)
- Cost per service tracking
- SLA reports (weekly/monthly)
- Multi-account support
- Integration with atlas-dashboard repo

---

**Status:** Design complete, ready for TDD implementation
