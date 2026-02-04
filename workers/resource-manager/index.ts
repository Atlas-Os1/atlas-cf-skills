/**
 * CF Resource Manager Worker
 * Query D1/R2/KV binding status via REST API
 */
export interface Env {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  KV?: KVNamespace;
  API_TOKEN?: string;
}

interface ResourceInfo {
  type: 'D1' | 'R2' | 'KV';
  name: string;
  status: 'connected' | 'unavailable';
  details?: Record<string, unknown>;
}

export async function listResources(env: Env): Promise<ResourceInfo[]> {
  const resources: ResourceInfo[] = [];
  
  if (env.DB) {
    try {
      const result = await env.DB.prepare('SELECT 1').first();
      resources.push({ type: 'D1', name: 'DB', status: result ? 'connected' : 'unavailable' });
    } catch {
      resources.push({ type: 'D1', name: 'DB', status: 'unavailable' });
    }
  }
  
  if (env.BUCKET) {
    try {
      const list = await env.BUCKET.list({ limit: 1 });
      resources.push({ type: 'R2', name: 'BUCKET', status: 'connected', details: { truncated: list.truncated } });
    } catch {
      resources.push({ type: 'R2', name: 'BUCKET', status: 'unavailable' });
    }
  }
  
  if (env.KV) {
    try {
      await env.KV.get('__healthcheck__');
      resources.push({ type: 'KV', name: 'KV', status: 'connected' });
    } catch {
      resources.push({ type: 'KV', name: 'KV', status: 'unavailable' });
    }
  }
  
  return resources;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const authHeader = request.headers.get('Authorization');
    if (env.API_TOKEN && authHeader !== `Bearer ${env.API_TOKEN}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/resources' || url.pathname === '/') {
      const resources = await listResources(env);
      return new Response(JSON.stringify({ resources }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  },
};
