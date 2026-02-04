/**
 * Cost Calculator
 * 
 * Calculates costs for Cloudflare services based on usage
 */

export class CostCalculator {
  // Cloudflare pricing (as of 2026)
  private pricing = {
    workers: {
      free_requests: 100000,
      paid_requests_per_million: 0.30,
      cpu_time_per_million_ms: 0.02
    },
    workers_ai: {
      // Included in Workers Paid plan ($5/month)
      cost_per_million_tokens: 0
    },
    r2: {
      storage_per_gb: 0.015,
      class_a_ops_per_million: 4.50,
      class_b_ops_per_million: 0.36,
      egress_per_gb: 0 // Zero egress!
    },
    d1: {
      free_rows_read: 5000000,
      free_rows_written: 100000,
      paid_rows_read_per_million: 0.001,
      paid_rows_written_per_million: 1.00
    },
    durable_objects: {
      request_per_million: 0.15,
      duration_per_gb_hour: 12.50
    },
    kv: {
      free_reads: 100000,
      free_writes: 1000,
      paid_reads_per_million: 0.50,
      paid_writes_per_million: 5.00,
      storage_per_gb: 0.50
    }
  };

  calculateWorkersCost(usage: any) {
    const { total_requests, cpu_time_ms } = usage;
    
    // Workers Paid plan: First 10M requests free
    const billable_requests = Math.max(0, total_requests - 10_000_000);
    const request_cost = (billable_requests / 1_000_000) * this.pricing.workers.paid_requests_per_million;
    
    const cpu_cost = (cpu_time_ms / 1_000_000) * this.pricing.workers.cpu_time_per_million_ms;
    
    return Math.round((request_cost + cpu_cost) * 100) / 100;
  }

  calculateWorkersAICost(usage: any) {
    // Workers AI included in Paid plan
    return 0;
  }

  calculateR2Cost(usage: any) {
    const { storage_gb, class_a_ops, class_b_ops } = usage;
    
    const storage_cost = storage_gb * this.pricing.r2.storage_per_gb;
    const a_ops_cost = (class_a_ops / 1_000_000) * this.pricing.r2.class_a_ops_per_million;
    const b_ops_cost = (class_b_ops / 1_000_000) * this.pricing.r2.class_b_ops_per_million;
    
    return Math.round((storage_cost + a_ops_cost + b_ops_cost) * 100) / 100;
  }

  calculateD1Cost(usage: any) {
    const { rows_read, rows_written } = usage;
    
    // D1 has generous free tier
    const billable_reads = Math.max(0, rows_read - this.pricing.d1.free_rows_read);
    const billable_writes = Math.max(0, rows_written - this.pricing.d1.free_rows_written);
    
    const read_cost = (billable_reads / 1_000_000) * this.pricing.d1.paid_rows_read_per_million;
    const write_cost = (billable_writes / 1_000_000) * this.pricing.d1.paid_rows_written_per_million;
    
    return Math.round((read_cost + write_cost) * 100) / 100;
  }

  calculateDOCost(usage: any) {
    const { request_count, active_time_hours } = usage;
    
    const request_cost = (request_count / 1_000_000) * this.pricing.durable_objects.request_per_million;
    
    // Assuming 128MB per instance
    const duration_cost = (active_time_hours * 0.128) * this.pricing.durable_objects.duration_per_gb_hour;
    
    return Math.round((request_cost + duration_cost) * 100) / 100;
  }

  calculateKVCost(usage: any) {
    const { read_count, write_count, storage_gb } = usage;
    
    const billable_reads = Math.max(0, read_count - this.pricing.kv.free_reads);
    const billable_writes = Math.max(0, write_count - this.pricing.kv.free_writes);
    
    const read_cost = (billable_reads / 1_000_000) * this.pricing.kv.paid_reads_per_million;
    const write_cost = (billable_writes / 1_000_000) * this.pricing.kv.paid_writes_per_million;
    const storage_cost = storage_gb * this.pricing.kv.storage_per_gb;
    
    return Math.round((read_cost + write_cost + storage_cost) * 100) / 100;
  }

  calculateTotalCost(breakdown: any) {
    const total = 
      breakdown.workers +
      breakdown.workers_ai +
      breakdown.r2 +
      breakdown.d1 +
      breakdown.durable_objects +
      breakdown.kv;
    
    return Math.round(total * 100) / 100;
  }
}
