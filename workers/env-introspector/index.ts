/**
 * Environment Introspector Worker - Safe env analysis endpoint
 */
export interface Env {
  AI?: Ai;
  [key: string]: unknown;
}

export interface EnvReport {
  timestamp: string;
  runtime: 'cloudflare-workers';
  bindings: { name: string; type: string }[];
  secrets: string[];
  vars: Record<string, string>;
  capabilities: string[];
}

const KNOWN_SECRETS = ['API_TOKEN', 'SECRET', 'KEY', 'PASSWORD', 'CREDENTIAL', 'ANTHROPIC', 'OPENAI', 'CLOUDFLARE_API'];

export function isSecret(name: string): boolean {
  return KNOWN_SECRETS.some(p => name.toUpperCase().includes(p));
}

export function detectBindingType(name: string, value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown';
  const obj = value as Record<string, unknown>;
  if ('prepare' in obj && 'batch' in obj) return 'D1';
  if ('put' in obj && 'get' in obj && 'list' in obj && 'delete' in obj) {
    return 'head' in obj ? 'R2' : 'KV';
  }
  if ('run' in obj && typeof obj.run === 'function') return 'AI';
  if ('send' in obj && 'sendBatch' in obj) return 'Queue';
  if ('get' in obj && 'idFromName' in obj) return 'DO';
  return 'unknown';
}

export function analyzeEnv(env: Env): EnvReport {
  const bindings: { name: string; type: string }[] = [];
  const secrets: string[] = [];
  const vars: Record<string, string> = {};
  const capabilities: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('__')) continue;
    if (typeof value === 'object' && value !== null) {
      const type = detectBindingType(key, value);
      bindings.push({ name: key, type });
      if (type === 'AI') capabilities.push('Workers AI');
      if (type === 'D1') capabilities.push('D1 Database');
      if (type === 'R2') capabilities.push('R2 Storage');
      if (type === 'KV') capabilities.push('KV Cache');
    } else if (typeof value === 'string') {
      if (isSecret(key)) secrets.push(key);
      else vars[key] = value;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    runtime: 'cloudflare-workers',
    bindings,
    secrets,
    vars,
    capabilities: [...new Set(capabilities)],
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/introspect' || url.pathname === '/') {
      const report = analyzeEnv(env);
      return new Response(JSON.stringify(report, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  },
};
