/**
 * R2 Sync Monitor Worker - Monitors R2 backup sync health
 */
export interface Env {
  BUCKET: R2Bucket;
  KV?: KVNamespace;
  ALERT_WEBHOOK?: string;
  STALE_THRESHOLD_MINUTES?: string;
}

export interface SyncStatus {
  healthy: boolean;
  lastSync: string | null;
  minutesSinceSync: number | null;
  fileCount: number;
  issues: string[];
}

export async function checkSyncHealth(env: Env): Promise<SyncStatus> {
  const issues: string[] = [];
  const staleThreshold = parseInt(env.STALE_THRESHOLD_MINUTES || '10', 10);
  let lastSync: string | null = null;
  let minutesSinceSync: number | null = null;

  try {
    const syncFile = await env.BUCKET.get('.last-sync');
    if (syncFile) {
      lastSync = await syncFile.text();
      const syncDate = new Date(lastSync.trim());
      minutesSinceSync = Math.floor((Date.now() - syncDate.getTime()) / 60000);
      if (minutesSinceSync > staleThreshold) {
        issues.push(`Sync is stale: ${minutesSinceSync} minutes old (threshold: ${staleThreshold})`);
      }
    } else {
      issues.push('No .last-sync file found');
    }
  } catch (error) {
    issues.push(`Error reading sync timestamp: ${error}`);
  }

  let fileCount = 0;
  try {
    let cursor: string | undefined;
    do {
      const list = await env.BUCKET.list({ cursor, limit: 1000 });
      fileCount += list.objects.length;
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  } catch (error) {
    issues.push(`Error listing bucket: ${error}`);
  }

  if (fileCount === 0) issues.push('Bucket is empty');

  return { healthy: issues.length === 0, lastSync, minutesSinceSync, fileCount, issues };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/') {
      const status = await checkSyncHealth(env);
      return new Response(JSON.stringify(status, null, 2), {
        status: status.healthy ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  },
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const status = await checkSyncHealth(env);
    if (!status.healthy && env.ALERT_WEBHOOK) {
      await fetch(env.ALERT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `⚠️ R2 Sync Alert: ${status.issues.join(', ')}`, status }),
      });
    }
  },
};
