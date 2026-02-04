# Atlas Cloudflare Skills

Cloudflare Worker skills for Atlas agents - built with TDD approach.

## Overview

This repository contains Cloudflare Worker-based skills designed to optimize Atlas infrastructure, reduce costs, and improve observability.

## Skills

### 1. Cloudflare Asset Monitor
Monitor all Cloudflare assets (Workers, R2, D1, DO, KV) across projects with usage tracking and cost analysis.

### 2. KBC Workers AI Migration
Migrate KiamichiBizConnect business agent from OpenAI GPT-4o-mini to Cloudflare Workers AI for cost optimization.

### 3. Health Check Dashboard
Centralized dashboard for monitoring all Workers, R2 buckets, D1 databases, and Durable Objects.

## Development

Each skill follows TDD approach:
1. Write tests first
2. Implement worker
3. Verify all tests pass
4. Deploy and integrate

## Structure

```
atlas-cf-skills/
├── skills/
│   ├── cloudflare-asset-monitor/
│   ├── kbc-workers-ai-migration/
│   └── health-check-dashboard/
├── tests/
├── docs/
│   └── plans/
└── package.json
```

## Testing

```bash
npm test                    # Run all tests
npm test -- <skill-name>    # Run specific skill tests
npm run test:watch          # Watch mode
```

## Deployment

Each skill has its own `wrangler.toml` for independent deployment:

```bash
cd skills/<skill-name>
npm run deploy
```

## License

MIT
