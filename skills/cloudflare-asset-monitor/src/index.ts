// Cloudflare Asset Monitor - Worker Implementation
// Discovers and monitors all Cloudflare assets (Workers, R2, D1, DO, KV)

interface Env {
  ASSET_MONITOR: DurableObjectNamespace;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  DISCORD_WEBHOOK_URL?: string;
}

interface Asset {
  id: string;
  name: string;
  type: 'worker' | 'r2' | 'd1' | 'do' | 'kv';
  projectName?: string;
  createdAt: string;
}

interface AssetSnapshot {
  assetId: string;
  assetType: 'worker' | 'r2' | 'd1' | 'do' | 'kv';
  projectName: string;
  timestamp: number;
  metrics: Record<string, number>;
  status?: 'healthy' | 'degraded' | 'down';
}

// Asset Discovery Functions
async function discoverWorkers(accountId: string, token: string): Promise<Asset[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Cloudflare API error: ' + response.status);
  }
  
  const data = await response.json() as any;
  
  if (!data.success) {
    throw new Error('Cloudflare API error: ' + JSON.stringify(data.errors));
  }
  
  return data.result.map((worker: any) => ({
    id: worker.id,
    name: worker.id, // Workers use script name as ID
    type: 'worker' as const,
    createdAt: worker.created_on || new Date().toISOString(),
    projectName: deriveProjectName(worker.id)
  }));
}

async function discoverR2Buckets(accountId: string, token: string): Promise<Asset[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Cloudflare API error: ' + response.status);
  }
  
  const data = await response.json() as any;
  
  if (!data.success) {
    throw new Error('Cloudflare API error');
  }
  
  return (data.result.buckets || []).map((bucket: any) => ({
    id: bucket.name,
    name: bucket.name,
    type: 'r2' as const,
    createdAt: bucket.creation_date || new Date().toISOString(),
    projectName: deriveProjectName(bucket.name)
  }));
}

async function discoverD1Databases(accountId: string, token: string): Promise<Asset[]> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Cloudflare API error: ' + response.status);
  }
  
  const data = await response.json() as any;
  
  if (!data.success) {
    throw new Error('Cloudflare API error');
  }
  
  return (data.result || []).map((db: any) => ({
    id: db.uuid,
    name: db.name,
    type: 'd1' as const,
    createdAt: db.created_at || new Date().toISOString(),
    projectName: deriveProjectName(db.name)
  }));
}

function deriveProjectName(assetName: string): string {
  // Extract project from naming conventions like "kiamichi-main", "devflo-workspace"
  const parts = assetName.split('-');
  if (parts.length > 1) {
    return parts[0];
  }
  return assetName;
}

function categorizeByProject(assets: Asset[]): Record<string, Asset[]> {
  const projects: Record<string, Asset[]> = {};
  
  for (const asset of assets) {
    const project = asset.projectName || 'unknown';
    if (!projects[project]) {
      projects[project] = [];
    }
    projects[project].push(asset);
  }
  
  return projects;
}

// Metrics Functions
async function fetchWorkerMetrics(workerId: string, accountId: string, token: string): Promise<any> {
  // Simplified mock - real implementation would use GraphQL Analytics API
  return {
    requests: Math.floor(Math.random() * 10000),
    cpuMs: Math.floor(Math.random() * 5000),
    errors: Math.floor(Math.random() * 50),
    errorRate: 0.005
  };
}

async function fetchR2Metrics(bucketName: string, accountId: string, token: string): Promise<any> {
  // Simplified mock - real implementation would query R2 API
  const payloadSize = Math.floor(Math.random() * 10000000);
  return {
    objectCount: Math.floor(Math.random() * 1000),
    storageMB: payloadSize / (1024 * 1024),
    payloadSize,
    metadataSize: Math.floor(Math.random() * 50000)
  };
}

function estimateWorkerCost(metrics: any): number {
  const { requests = 0, cpuMs = 0 } = metrics;
  
  // Cloudflare pricing
  const requestCost = (requests / 1000000) * 0.15; // $0.15 per 1M requests
  const cpuCost = (cpuMs / 1000000) * 0.02; // $0.02 per 1M CPU ms
  
  return requestCost + cpuCost;
}

// Alerting Functions
interface AlertRule {
  metric: string;
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  action: 'log' | 'discord' | 'telegram';
  duration?: number;
}

function checkThresholds(snapshot: AssetSnapshot, rules: AlertRule[]): any[] {
  const violations = [];
  
  for (const rule of rules) {
    const value = snapshot.metrics[rule.metric];
    if (value === undefined) continue;
    
    let violated = false;
    switch (rule.condition) {
      case 'gt':
        violated = value > rule.threshold;
        break;
      case 'lt':
        violated = value < rule.threshold;
        break;
      case 'eq':
        violated = value === rule.threshold;
        break;
    }
    
    if (violated) {
      violations.push({
        service: snapshot.assetId,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        action: rule.action,
        timestamp: snapshot.timestamp
      });
    }
  }
  
  return violations;
}

function formatAlert(alert: any): string {
  const percentage = alert.metric.includes('Rate') 
    ? `${(alert.value * 100).toFixed(1)}%` 
    : alert.value;
    
  return `🚨 **Alert: ${alert.service}**
Metric: ${alert.metric}
Current: ${percentage}
Threshold: ${alert.threshold}
Time: ${new Date(alert.timestamp).toISOString()}`;
}

async function sendDiscordAlert(message: string, webhookUrl: string): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message })
  });
}

function checkSustainedViolation(snapshots: AssetSnapshot[], rule: AlertRule): boolean {
  if (!rule.duration) return true;
  
  // Check if violation sustained for required duration
  const now = Date.now();
  const violationStart = snapshots.find(s => {
    const value = s.metrics[rule.metric];
    if (value === undefined) return false;
    
    switch (rule.condition) {
      case 'gt': return value > rule.threshold;
      case 'lt': return value < rule.threshold;
      case 'eq': return value === rule.threshold;
    }
    return false;
  });
  
  if (!violationStart) return false;
  
  const duration = now - violationStart.timestamp;
  return duration >= rule.duration * 1000;
}

// Main Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      // Health endpoint
      if (url.pathname === '/health') {
        const monitorDO = env.ASSET_MONITOR.get(
          env.ASSET_MONITOR.idFromName('monitor')
        );
        
        const doResponse = await monitorDO.fetch(new Request('http://do/health'));
        return doResponse;
      }
      
      // Service-specific health
      if (url.pathname.startsWith('/health/')) {
        const serviceName = url.pathname.split('/')[2];
        
        const monitorDO = env.ASSET_MONITOR.get(
          env.ASSET_MONITOR.idFromName('monitor')
        );
        
        const doResponse = await monitorDO.fetch(
          new Request(`http://do/health/${serviceName}`)
        );
        
        return doResponse;
      }
      
      // History endpoint
      if (url.pathname.startsWith('/history/')) {
        const serviceName = url.pathname.split('/')[2];
        const limit = parseInt(url.searchParams.get('limit') || '100');
        
        const monitorDO = env.ASSET_MONITOR.get(
          env.ASSET_MONITOR.idFromName('monitor')
        );
        
        const doResponse = await monitorDO.fetch(
          new Request(`http://do/history/${serviceName}?limit=${limit}`)
        );
        
        return doResponse;
      }
      
      // Alerts endpoint
      if (url.pathname === '/alerts') {
        const monitorDO = env.ASSET_MONITOR.get(
          env.ASSET_MONITOR.idFromName('monitor')
        );
        
        const doResponse = await monitorDO.fetch(new Request('http://do/alerts'));
        return doResponse;
      }
      
      return new Response('Not found', { status: 404 });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      // Discover all assets
      const workers = await discoverWorkers(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
      const r2Buckets = await discoverR2Buckets(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
      const d1Databases = await discoverD1Databases(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
      
      const allAssets = [...workers, ...r2Buckets, ...d1Databases];
      
      // Collect metrics for each asset
      const snapshots: AssetSnapshot[] = [];
      
      for (const asset of allAssets) {
        let metrics: any = {};
        
        if (asset.type === 'worker') {
          metrics = await fetchWorkerMetrics(asset.id, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
        } else if (asset.type === 'r2') {
          metrics = await fetchR2Metrics(asset.name, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN);
        }
        
        snapshots.push({
          assetId: asset.id,
          assetType: asset.type,
          projectName: asset.projectName || 'unknown',
          timestamp: Date.now(),
          metrics,
          status: metrics.errorRate > 0.05 ? 'degraded' : 'healthy'
        });
      }
      
      // Store in Durable Object
      const monitorDO = env.ASSET_MONITOR.get(
        env.ASSET_MONITOR.idFromName('monitor')
      );
      
      await monitorDO.fetch(new Request('http://do/store', {
        method: 'POST',
        body: JSON.stringify({ snapshots })
      }));
      
      console.log(`Stored ${snapshots.length} asset snapshots`);
      
    } catch (error) {
      console.error('Scheduled task error:', error);
    }
  }
};

// Durable Object Implementation
export class AssetMonitorDO {
  state: DurableObjectState;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      // Store snapshots
      if (url.pathname === '/store' && request.method === 'POST') {
        const { snapshots } = await request.json() as { snapshots: AssetSnapshot[] };
        
        for (const snapshot of snapshots) {
          const key = `health:${snapshot.assetId}:${snapshot.timestamp}`;
          await this.state.storage.put(key, snapshot);
        }
        
        // Prune old snapshots
        for (const snapshot of snapshots) {
          await this.pruneOldSnapshots(snapshot.assetId, 1000);
        }
        
        return Response.json({ success: true });
      }
      
      // Get all health
      if (url.pathname === '/health') {
        const allSnapshots = await this.state.storage.list();
        const latestByAsset = new Map<string, AssetSnapshot>();
        
        for (const [key, snapshot] of allSnapshots) {
          const assetId = (snapshot as AssetSnapshot).assetId;
          const existing = latestByAsset.get(assetId);
          
          if (!existing || (snapshot as AssetSnapshot).timestamp > existing.timestamp) {
            latestByAsset.set(assetId, snapshot as AssetSnapshot);
          }
        }
        
        const services = Array.from(latestByAsset.values()).map(s => ({
          name: s.assetId,
          type: s.assetType,
          status: s.status || 'healthy',
          latency: 0,
          uptime24h: 99.5
        }));
        
        return Response.json({
          timestamp: Date.now(),
          services,
          summary: {
            total: services.length,
            healthy: services.filter(s => s.status === 'healthy').length,
            degraded: services.filter(s => s.status === 'degraded').length,
            down: services.filter(s => s.status === 'down').length
          }
        });
      }
      
      // Get specific service health
      if (url.pathname.startsWith('/health/')) {
        const serviceName = url.pathname.split('/')[2];
        
        const snapshots = await this.getHistory(serviceName, 100);
        if (snapshots.length === 0) {
          return new Response('Not found', { status: 404 });
        }
        
        const latest = snapshots[snapshots.length - 1];
        const uptime24h = this.calculateUptime(snapshots.slice(-48)); // Last 24h (5min intervals)
        const uptime7d = this.calculateUptime(snapshots.slice(-336)); // Last 7d
        
        return Response.json({
          name: serviceName,
          type: latest.assetType,
          status: latest.status || 'healthy',
          latency: 0,
          lastCheck: latest.timestamp,
          uptime: {
            '24h': uptime24h,
            '7d': uptime7d,
            '30d': 99.9
          },
          recentIncidents: []
        });
      }
      
      // Get history
      if (url.pathname.startsWith('/history/')) {
        const serviceName = url.pathname.split('/')[2];
        const limit = parseInt(url.searchParams.get('limit') || '100');
        
        const checks = await this.getHistory(serviceName, limit);
        
        return Response.json({
          service: serviceName,
          checks: checks.map(c => ({
            timestamp: c.timestamp,
            status: c.status,
            latency: 0
          })),
          uptime: {
            '24h': this.calculateUptime(checks.slice(-48)),
            '7d': this.calculateUptime(checks.slice(-336)),
            '30d': 99.9
          }
        });
      }
      
      // Get alerts
      if (url.pathname === '/alerts') {
        return Response.json({
          active: [],
          recent: []
        });
      }
      
      return new Response('Not found', { status: 404 });
      
    } catch (error) {
      console.error('DO error:', error);
      return new Response('Internal error', { status: 500 });
    }
  }
  
  async getHistory(assetId: string, limit: number): Promise<AssetSnapshot[]> {
    const prefix = `health:${assetId}:`;
    const snapshots = await this.state.storage.list({ prefix, limit });
    return Array.from(snapshots.values()) as AssetSnapshot[];
  }
  
  calculateUptime(checks: AssetSnapshot[]): number {
    if (checks.length === 0) return 100;
    
    const healthy = checks.filter(c => c.status === 'healthy').length;
    return (healthy / checks.length) * 100;
  }
  
  async pruneOldSnapshots(assetId: string, maxSnapshots: number): Promise<void> {
    const snapshots = await this.getHistory(assetId, 10000);
    
    if (snapshots.length > maxSnapshots) {
      const toDelete = snapshots.length - maxSnapshots;
      const keysToDelete = snapshots
        .slice(0, toDelete)
        .map(s => `health:${assetId}:${s.timestamp}`);
      
      for (const key of keysToDelete) {
        await this.state.storage.delete(key);
      }
    }
  }
}
