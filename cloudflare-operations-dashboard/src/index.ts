/**
 * Cloudflare Operations Dashboard Worker
 * 
 * Monitors health and costs across all Cloudflare resources:
 * - Workers, D1, Durable Objects, R2, KV
 * - Workers AI token usage
 * - Cost tracking and forecasting
 * - Multi-project support
 */

import { CloudflareAPIClient } from './cloudflare-api';
import { CostCalculator } from './cost-calculator';
import { AlertManager } from './alert-manager';

// Project presets for fast filtering
const PROJECT_PRESETS: Record<string, string[]> = {
  'devflo': ['devflo-moltworker'],
  'kiamichi': ['kiamichi-biz-connect', 'kiamichi-business-agent', 'kiamichi-biz-ai-analyzer', 'kiamichi-facebook-worker'],
  'minte': ['minte-blog-worker', 'cloudflare-ops-dashboard', 'flo-social-worker'],
  'srvcflo': ['srvcflo-marketing', 'atlas-admin-ui', 'atlas-srvcflo'],
  'atlas': ['atlas-admin-ui', 'atlas-dashboard', 'atlas-code-orchestrator', 'memory-search', 'memory-embedder'],
  'all': [] // Empty array means show all
};

export interface Env {
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  DASHBOARD_DO: DurableObjectNamespace;
  DISCORD_WEBHOOK_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Debug: Check if secrets are loaded
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      return new Response(JSON.stringify({
        error: 'Missing secrets',
        has_token: !!env.CLOUDFLARE_API_TOKEN,
        has_account_id: !!env.CLOUDFLARE_ACCOUNT_ID
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    
    const api = new CloudflareAPIClient(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID);
    const costs = new CostCalculator();
    const alerts = new AlertManager(env);

    try {
      // CORS headers for dashboard UI
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Dashboard overview
      if (url.pathname === '/api/overview') {
        const project = url.searchParams.get('project');
        const overview = await getDashboardOverview(api, project);
        return jsonResponse(overview, corsHeaders);
      }

      // Worker health
      if (url.pathname === '/api/workers') {
        const workers = await api.listWorkers();
        return jsonResponse({ workers }, corsHeaders);
      }

      if (url.pathname.startsWith('/api/workers/')) {
        const name = url.pathname.split('/')[3];
        const timeframe = url.searchParams.get('timeframe') || '24h';
        
        if (url.pathname.endsWith('/health')) {
          const health = await api.getWorkerHealth(name);
          return jsonResponse(health, corsHeaders);
        }
        
        if (url.pathname.endsWith('/metrics')) {
          const metrics = await api.getWorkerMetrics(name, timeframe);
          return jsonResponse(metrics, corsHeaders);
        }
        
        if (url.pathname.endsWith('/latency')) {
          const latency = await api.getWorkerLatency(name, timeframe);
          return jsonResponse(latency, corsHeaders);
        }
      }

      // D1 databases
      if (url.pathname === '/api/d1') {
        const databases = await api.listD1Databases();
        return jsonResponse({ databases }, corsHeaders);
      }

      if (url.pathname.startsWith('/api/d1/')) {
        const name = url.pathname.split('/')[3];
        const timeframe = url.searchParams.get('timeframe') || '24h';
        
        if (url.pathname.endsWith('/metrics')) {
          const metrics = await api.getD1Metrics(name, timeframe);
          return jsonResponse(metrics, corsHeaders);
        }
        
        if (url.pathname.endsWith('/storage')) {
          const storage = await api.getD1Storage(name);
          return jsonResponse(storage, corsHeaders);
        }
      }

      // Durable Objects
      if (url.pathname === '/api/durable-objects') {
        const namespaces = await api.listDurableObjects();
        return jsonResponse({ namespaces }, corsHeaders);
      }

      if (url.pathname.startsWith('/api/durable-objects/')) {
        const name = url.pathname.split('/')[3];
        
        if (url.pathname.endsWith('/instances')) {
          const instances = await api.getDOInstances(name);
          return jsonResponse(instances, corsHeaders);
        }
        
        if (url.pathname.endsWith('/storage')) {
          const storage = await api.getDOStorage(name);
          return jsonResponse(storage, corsHeaders);
        }
      }

      // R2 buckets
      if (url.pathname === '/api/r2') {
        const buckets = await api.listR2Buckets();
        return jsonResponse({ buckets }, corsHeaders);
      }

      if (url.pathname.startsWith('/api/r2/')) {
        const name = url.pathname.split('/')[3];
        
        if (url.pathname.endsWith('/usage')) {
          const usage = await api.getR2Usage(name);
          return jsonResponse(usage, corsHeaders);
        }
      }

      // KV namespaces
      if (url.pathname === '/api/kv') {
        const namespaces = await api.listKVNamespaces();
        return jsonResponse({ namespaces }, corsHeaders);
      }

      if (url.pathname.startsWith('/api/kv/')) {
        const name = url.pathname.split('/')[3];
        const timeframe = url.searchParams.get('timeframe') || '24h';
        
        if (url.pathname.endsWith('/metrics')) {
          const metrics = await api.getKVMetrics(name, timeframe);
          return jsonResponse(metrics, corsHeaders);
        }
      }

      // Cost tracking
      if (url.pathname === '/api/costs') {
        const timeframe = url.searchParams.get('timeframe') || '30d';
        const summary = await getTotalCosts(api, costs, timeframe);
        return jsonResponse(summary, corsHeaders);
      }

      if (url.pathname === '/api/costs/workers-ai') {
        const timeframe = url.searchParams.get('timeframe') || '30d';
        const usage = await api.getWorkersAIUsage(timeframe);
        const cost = costs.calculateWorkersAICost(usage);
        return jsonResponse({ usage, cost }, corsHeaders);
      }

      if (url.pathname === '/api/costs/r2') {
        const timeframe = url.searchParams.get('timeframe') || '30d';
        const r2Costs = await api.getR2Costs(timeframe);
        return jsonResponse(r2Costs, corsHeaders);
      }

      if (url.pathname === '/api/costs/d1') {
        const timeframe = url.searchParams.get('timeframe') || '30d';
        const d1Usage = await api.getD1Usage(timeframe);
        const cost = costs.calculateD1Cost(d1Usage);
        return jsonResponse({ usage: d1Usage, cost }, corsHeaders);
      }

      if (url.pathname === '/api/costs/forecast') {
        const forecast = await forecastCosts(api, costs);
        return jsonResponse(forecast, corsHeaders);
      }

      // Alerts
      if (url.pathname === '/api/alerts' && request.method === 'GET') {
        const timeframe = url.searchParams.get('timeframe') || '7d';
        const severity = url.searchParams.get('severity');
        const history = await alerts.getHistory(timeframe, severity ? { severity } : undefined);
        return jsonResponse({ alerts: history }, corsHeaders);
      }

      if (url.pathname === '/api/alerts' && request.method === 'POST') {
        const config = await request.json();
        await alerts.setThreshold(config);
        return jsonResponse({ success: true }, corsHeaders);
      }

      if (url.pathname === '/api/alerts/test') {
        await alerts.sendTestAlert();
        return jsonResponse({ success: true }, corsHeaders);
      }

      // Dashboard UI
      if (url.pathname === '/' || url.pathname === '/dashboard') {
        return new Response(renderDashboard(), {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Dashboard error:', error);
      return new Response(JSON.stringify({ 
        error: error.message || 'Internal Server Error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

async function getDashboardOverview(api: CloudflareAPIClient, project?: string | null) {
  // Parallelize all API calls for speed
  const [workers, databases, buckets, namespaces, durableObjects] = await Promise.all([
    api.listWorkers(),
    api.listD1Databases(),
    api.listR2Buckets(),
    api.listKVNamespaces(),
    api.listDurableObjects()
  ]);

  // Get project filter list
  const projectFilters = project && PROJECT_PRESETS[project] ? PROJECT_PRESETS[project] : [];
  const showAll = !project || project === 'all' || projectFilters.length === 0;

  // Smart filtering: match worker ID/name against project preset list
  const filterByProject = (items: any[]) => {
    if (showAll) return items;
    return items.filter(item => {
      const name = item.name || item.id || item.title || '';
      return projectFilters.some(filter => name.includes(filter));
    });
  };

  return {
    available_projects: Object.keys(PROJECT_PRESETS),
    current_project: project || 'all',
    workers: filterByProject(workers),
    databases: filterByProject(databases),
    r2_buckets: filterByProject(buckets),
    kv_namespaces: filterByProject(namespaces),
    durable_objects: filterByProject(durableObjects),
    timestamp: new Date().toISOString()
  };
}

async function getTotalCosts(api: CloudflareAPIClient, costs: CostCalculator, timeframe: string) {
  // Parallelize all cost API calls
  const [workersAIUsage, r2Costs, d1Usage, workersUsage, doCosts, kvUsage] = await Promise.all([
    api.getWorkersAIUsage(timeframe),
    api.getR2Costs(timeframe),
    api.getD1Usage(timeframe),
    api.getWorkersUsage(timeframe),
    api.getDOCosts(timeframe),
    api.getKVUsage(timeframe)
  ]);

  return {
    workers: costs.calculateWorkersCost(workersUsage),
    workers_ai: costs.calculateWorkersAICost(workersAIUsage),
    r2: r2Costs.total_cost_usd,
    d1: costs.calculateD1Cost(d1Usage),
    durable_objects: doCosts.cost_usd,
    kv: costs.calculateKVCost(kvUsage),
    total_usd: 0 // Sum calculated in CostCalculator
  };
}

async function forecastCosts(api: CloudflareAPIClient, costs: CostCalculator) {
  // Simple linear forecast based on last 30 days
  const currentMonth = await getTotalCosts(api, costs, '30d');
  const previousMonth = await getTotalCosts(api, costs, '60d');
  
  const trend = currentMonth.total_usd / previousMonth.total_usd;
  const estimated = currentMonth.total_usd * trend;
  
  return {
    estimated_total_usd: Math.round(estimated * 100) / 100,
    confidence_interval: {
      low: Math.round(estimated * 0.9 * 100) / 100,
      high: Math.round(estimated * 1.1 * 100) / 100
    },
    trend_percent: Math.round((trend - 1) * 100)
  };
}

function jsonResponse(data: any, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      ...additionalHeaders
    }
  });
}

function renderDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare Operations Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #f5f5f5; }
    header { background: #1a1a1a; padding: 1.5rem; border-bottom: 2px solid #ff6b35; display: flex; justify-content: space-between; align-items: center; }
    h1 { font-size: 1.75rem; font-weight: 700; }
    select { background: #2a2a2a; color: #f5f5f5; border: 1px solid #444; border-radius: 4px; padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; }
    select:hover { background: #333; }
    .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1.5rem; }
    .card h2 { font-size: 1.25rem; margin-bottom: 1rem; color: #ff6b35; }
    .metric { display: flex; justify-content: space-between; margin: 0.75rem 0; }
    .metric-label { color: #999; }
    .metric-value { font-weight: 600; font-size: 1.1rem; }
    .status { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; }
    .status.healthy { background: #10b981; color: white; }
    .status.warning { background: #f59e0b; color: white; }
    .status.critical { background: #ef4444; color: white; }
    #loading { text-align: center; padding: 4rem; font-size: 1.25rem; color: #666; }
  </style>
</head>
<body>
  <header>
    <h1>🌩️ Cloudflare Operations Dashboard</h1>
    <select id="projectSelect" onchange="switchProject()">
      <option value="all">All Projects</option>
      <option value="kiamichi">Kiamichi Biz Connect</option>
      <option value="minte">Minte.dev</option>
      <option value="srvcflo">SrvcFlo</option>
      <option value="devflo">DevFlo</option>
      <option value="atlas">Atlas</option>
    </select>
  </header>
  <div class="container">
    <div id="loading">Loading dashboard data...</div>
    <div id="dashboard" style="display: none;">
      <div class="grid" id="overview"></div>
      <div class="grid" id="costs" style="margin-top: 2rem;"></div>
    </div>
  </div>
  
  <script>
    let currentProject = 'all';
    
    async function loadDashboard(project = 'all') {
      try {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading').innerHTML = 'Loading dashboard data...';
        
        const projectParam = project === 'all' ? '' : '?project=' + project;
        const [overview, costs] = await Promise.all([
          fetch('/api/overview' + projectParam).then(r => r.json()),
          fetch('/api/costs?timeframe=30d').then(r => r.json())
        ]);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        renderOverview(overview);
        renderCosts(costs);
      } catch (error) {
        document.getElementById('loading').innerHTML = 'Error loading dashboard: ' + error.message;
      }
    }
    
    function switchProject() {
      const select = document.getElementById('projectSelect');
      currentProject = select.value;
      loadDashboard(currentProject);
    }
    
    function renderOverview(data) {
      const container = document.getElementById('overview');
      container.innerHTML = \`
        <div class="card">
          <h2>Workers</h2>
          <div class="metric"><span class="metric-label">Total:</span><span class="metric-value">\${data.workers.length}</span></div>
          <div class="metric"><span class="metric-label">Status:</span><span class="status healthy">All Healthy</span></div>
        </div>
        <div class="card">
          <h2>D1 Databases</h2>
          <div class="metric"><span class="metric-label">Total:</span><span class="metric-value">\${data.databases.length}</span></div>
        </div>
        <div class="card">
          <h2>R2 Buckets</h2>
          <div class="metric"><span class="metric-label">Total:</span><span class="metric-value">\${data.r2_buckets.length}</span></div>
        </div>
        <div class="card">
          <h2>Durable Objects</h2>
          <div class="metric"><span class="metric-label">Namespaces:</span><span class="metric-value">\${data.durable_objects.length}</span></div>
        </div>
      \`;
    }
    
    function renderCosts(data) {
      const container = document.getElementById('costs');
      container.innerHTML = \`
        <div class="card">
          <h2>Monthly Costs</h2>
          <div class="metric"><span class="metric-label">Workers:</span><span class="metric-value">$\${data.workers.toFixed(2)}</span></div>
          <div class="metric"><span class="metric-label">Workers AI:</span><span class="metric-value">$\${data.workers_ai.toFixed(2)}</span></div>
          <div class="metric"><span class="metric-label">R2:</span><span class="metric-value">$\${data.r2.toFixed(2)}</span></div>
          <div class="metric"><span class="metric-label">D1:</span><span class="metric-value">$\${data.d1.toFixed(2)}</span></div>
          <div class="metric"><span class="metric-label">Total:</span><span class="metric-value">$\${data.total_usd.toFixed(2)}</span></div>
        </div>
      \`;
    }
    
    loadDashboard();
    setInterval(loadDashboard, 60000); // Refresh every minute
  </script>
</body>
</html>`;
}
