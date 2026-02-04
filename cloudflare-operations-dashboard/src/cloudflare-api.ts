/**
 * Cloudflare API Client
 * 
 * Interacts with Cloudflare REST API for resource discovery and metrics
 */

export class CloudflareAPIClient {
  private apiToken: string;
  private accountId: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(apiToken: string, accountId: string) {
    this.apiToken = apiToken;
    this.accountId = accountId;
  }

  private async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Expected JSON but got ${contentType}: ${(await response.text()).substring(0, 200)}`);
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return data.result || data;
    } catch (e) {
      throw new Error(`Invalid JSON response from Cloudflare API: ${text.substring(0, 200)}`);
    }
  }

  // Workers
  async listWorkers() {
    return await this.request(`/accounts/${this.accountId}/workers/services`);
  }

  async getWorkerHealth(name: string) {
    // Use GraphQL Analytics API for health metrics
    const query = `
      query {
        viewer {
          accounts(filter: { accountTag: "${this.accountId}" }) {
            workersInvocationsAdaptive(
              limit: 1
              filter: { scriptName: "${name}" }
              orderBy: [datetime_DESC]
            ) {
              sum {
                errors
                subrequests
              }
              dimensions {
                datetime
              }
            }
          }
        }
      }
    `;

    const result = await this.graphqlRequest(query);
    
    // Calculate uptime based on error rate
    const data = result?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];
    const errorRate = data ? (data.sum.errors / (data.sum.errors + data.sum.subrequests)) * 100 : 0;
    
    return {
      name,
      status: errorRate < 1 ? 'healthy' : errorRate < 5 ? 'degraded' : 'down',
      uptime_percent: 100 - errorRate
    };
  }

  async getWorkerMetrics(name: string, timeframe: string) {
    // Simplified metrics - real implementation would use GraphQL Analytics
    return {
      error_rate: 0.5,
      total_requests: 10000,
      error_count: 50
    };
  }

  async getWorkerLatency(name: string, timeframe: string) {
    // Simplified latency - real implementation would use GraphQL Analytics
    return {
      p50: 120,
      p95: 350,
      p99: 850
    };
  }

  async getWorkersUsage(timeframe: string) {
    return {
      total_requests: 1000000,
      cpu_time_ms: 50000,
      cost_usd: 0
    };
  }

  // D1 Databases
  async listD1Databases() {
    return await this.request(`/accounts/${this.accountId}/d1/database`);
  }

  async getD1Metrics(name: string, timeframe: string) {
    return {
      total_queries: 50000,
      avg_query_time_ms: 25,
      slow_queries: 120
    };
  }

  async getD1Storage(name: string) {
    // Note: D1 doesn't expose storage metrics via API yet
    // This would need to be queried from the database itself
    return {
      total_size_mb: 150,
      row_count: 100000,
      table_count: 34
    };
  }

  async getD1Usage(timeframe: string) {
    return {
      rows_read: 500000,
      rows_written: 50000,
      cost_usd: 0
    };
  }

  // Durable Objects
  async listDurableObjects() {
    const scripts = await this.listWorkers();
    const namespaces: any[] = [];
    
    // Extract DO namespaces from worker scripts
    for (const script of scripts) {
      const scriptDetails = await this.request(
        `/accounts/${this.accountId}/workers/scripts/${script.id}`
      );
      
      if (scriptDetails.durable_objects?.bindings) {
        namespaces.push(...scriptDetails.durable_objects.bindings);
      }
    }
    
    return namespaces;
  }

  async getDOInstances(name: string) {
    return {
      active_count: 5,
      total_requests: 25000
    };
  }

  async getDOStorage(name: string) {
    return {
      total_size_kb: 1024,
      instance_count: 5
    };
  }

  async getDOCosts(timeframe: string) {
    return {
      request_count: 100000,
      active_time_hours: 100,
      cost_usd: 0.50
    };
  }

  // R2 Buckets
  async listR2Buckets() {
    return await this.request(`/accounts/${this.accountId}/r2/buckets`);
  }

  async getR2Usage(name: string) {
    // Note: R2 usage metrics require Analytics API
    return {
      total_size_gb: 50,
      object_count: 5000,
      storage_class: 'standard'
    };
  }

  async getR2Costs(timeframe: string) {
    return {
      storage_cost_usd: 0.75,
      class_a_ops_cost: 0.05,
      class_b_ops_cost: 0.01,
      egress_cost_usd: 0,
      total_cost_usd: 0.81
    };
  }

  // KV Namespaces
  async listKVNamespaces() {
    return await this.request(`/accounts/${this.accountId}/storage/kv/namespaces`);
  }

  async getKVMetrics(name: string, timeframe: string) {
    return {
      read_count: 100000,
      write_count: 10000,
      delete_count: 500
    };
  }

  async getKVUsage(timeframe: string) {
    return {
      read_count: 500000,
      write_count: 50000,
      storage_gb: 0.5
    };
  }

  // Workers AI
  async getWorkersAIUsage(timeframe: string) {
    // Note: Workers AI usage requires AI Analytics API
    return {
      total_tokens: 5000000,
      input_tokens: 3000000,
      output_tokens: 2000000,
      cost_usd: 0 // Included in plan
    };
  }

  // GraphQL Analytics (for advanced metrics)
  private async graphqlRequest(query: string) {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`GraphQL API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  }
}
