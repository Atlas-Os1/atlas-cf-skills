# KBC Workers AI Migration

Migrate KiamichiBizConnect business agent from OpenAI GPT-4o-mini to Cloudflare Workers AI Llama 3.1 8B Instruct for cost optimization.

## Overview

**Goal:** Reduce AI costs by 80%+ while maintaining response quality

**Current State:**
- Model: OpenAI GPT-4o-mini
- Cost: ~$0.15 input + $0.60 output per 1M tokens
- Location: `app.kiamichibizconnect.com`

**Target State:**
- Model: Cloudflare Workers AI Llama 3.1 8B Instruct
- Cost: $0 (included in Workers Paid plan)
- Same Durable Object architecture

## Files

```
kbc-workers-ai-migration/
├── SKILL.md                      # Agent instructions
├── README.md                     # This file (human-readable)
├── scripts/
│   ├── capture-baseline.sh       # Step 1: Capture OpenAI baseline
│   ├── compare-responses.sh      # Step 2: Compare Workers AI to baseline
│   ├── monitor-rollout.sh        # Step 3: Monitor gradual rollout
│   ├── rollback.sh               # Emergency: Revert to OpenAI
│   ├── remove-openai-fallback.sh # Step 4: Cleanup after success
│   └── analyze-failures.sh       # Debug: Analyze failed queries
├── src/
│   └── business-agent-do.ts      # Updated Durable Object
└── tests/
    └── migration.test.ts         # Automated tests
```

## Quick Start

### 1. Capture Baseline

```bash
cd /home/flo/atlas-cf-skills/kbc-workers-ai-migration
./scripts/capture-baseline.sh
```

This runs 10 test queries through current OpenAI agent and saves responses.

### 2. Deploy Workers AI Version

```bash
# Deploy to staging first
cd /home/flo/kiamichibizconnect
wrangler deploy --env staging

# Set ENABLE_WORKERS_AI=false (start with 0% traffic)
wrangler secret put ENABLE_WORKERS_AI --env staging <<< "false"
```

### 3. Compare Responses

```bash
cd /home/flo/atlas-cf-skills/kbc-workers-ai-migration
./scripts/compare-responses.sh
```

**Quality gates:**
- ✅ 90%+ semantic similarity to OpenAI
- ✅ 100% tool calls execute correctly
- ✅ Response time <2s (p95)

**If any gate fails:** Review failures, adjust prompts/temperature, retry

### 4. Gradual Rollout

Once quality gates pass, start gradual rollout:

```bash
# Week 1: 10% traffic
wrangler secret put ENABLE_WORKERS_AI --env production <<< "true"
wrangler secret put WORKERS_AI_TRAFFIC_PCT --env production <<< "10"
wrangler deploy --env production

./scripts/monitor-rollout.sh 10

# Week 2: 50% if metrics good
wrangler secret put WORKERS_AI_TRAFFIC_PCT --env production <<< "50"

# Week 3: 100% if no regressions
wrangler secret put WORKERS_AI_TRAFFIC_PCT --env production <<< "100"
```

### 5. Cleanup

After 2 weeks at 100% with no issues:

```bash
./scripts/remove-openai-fallback.sh
```

This removes OpenAI fallback code and deletes the API key secret.

## Rollback

If quality issues detected:

```bash
./scripts/rollback.sh
```

This immediately reverts to 100% OpenAI.

**Rollback triggers:**
- User complaints increase >20%
- Error rate spikes >5%
- Tool execution failures >2%
- Response quality drops <85%

## Testing

```bash
npm test -- tests/migration.test.ts
```

**Test coverage:**
- Tool invocation (page editing, content generation, social scheduling)
- Multi-turn conversations
- Error handling and fallbacks
- Response quality validation
- Performance benchmarks
- Cost comparison

## Success Metrics

**Cost:**
- Before: ~$15-30/month (OpenAI)
- After: $0 (Workers AI included)
- **Target: >80% cost reduction**

**Quality:**
- Semantic similarity: >90%
- Tool execution: 100%
- User satisfaction: No regression

**Performance:**
- Response time: <2s (p95)
- Error rate: <1%
- Uptime: >99.9%

## Troubleshooting

### Quality too low?

1. Review failed queries:
   ```bash
   ./scripts/analyze-failures.sh
   ```

2. Try adjusting temperature:
   - Current: 0.7
   - Lower (0.5): More deterministic
   - Higher (0.9): More creative

3. Consider Llama 3.3 70B:
   ```typescript
   // In business-agent-do.ts
   await this.ai.run('@cf/meta/llama-3.3-70b-instruct', {
     // ...
   });
   ```

### High fallback rate?

- Check Workers AI quotas/limits
- Verify AI binding in wrangler.toml
- Review error logs for patterns

### Slow response times?

- Workers AI runs at edge (fast)
- Check network latency
- Verify no unnecessary DB queries
- Consider caching frequent responses

## Support

**Issues:** https://github.com/Atlas-Os1/atlas-cf-skills/issues
**Docs:** See SKILL.md for detailed agent instructions
**Minte:** Message in Discord #dev-team channel

---

**Remember:** Test thoroughly, deploy gradually, monitor obsessively. Cost savings are worthless if quality suffers.
