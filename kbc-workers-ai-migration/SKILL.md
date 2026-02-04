# KBC Workers AI Migration

---
name: kbc-workers-ai-migration
description: Use when migrating KBC business agent from OpenAI to Cloudflare Workers AI. Validates response quality, handles fallbacks, tests before production deployment. Ensures cost savings without quality loss.
---

## Overview

Migrate KiamichiBizConnect business agent from OpenAI GPT-4o-mini to Cloudflare Workers AI Llama 3.1 8B Instruct for cost optimization while maintaining response quality.

**Core Principle:** Test thoroughly, deploy incrementally, maintain rollback capability.

## When to Use This Skill

**Triggers:**
- "Migrate KBC to Workers AI"
- "Replace OpenAI with Workers AI in business agent"
- "Reduce KBC AI costs"
- "Switch business agent to Llama 3.1"

**Context Required:**
- Current KBC business agent Durable Object implementation
- OpenAI baseline response examples
- Workers AI binding configuration
- Test scenarios covering all agent tools

## Implementation Guide

### Phase 1: Baseline & Testing Setup

**Before changing ANY code:**

1. **Capture OpenAI Baseline**
   ```bash
   cd /home/flo/atlas-cf-skills/kbc-workers-ai-migration
   ./scripts/capture-baseline.sh
   ```
   - Run 10+ test queries through current OpenAI agent
   - Save responses with timestamps
   - Document tool usage patterns
   - Calculate average token costs

2. **Create Test Suite**
   ```bash
   npm test -- tests/migration.test.ts
   ```
   Must cover:
   - Tool invocation (page editing, content generation, social scheduling)
   - Multi-turn conversations
   - Error handling
   - Response quality (coherence, accuracy, tone)

### Phase 2: Workers AI Implementation

**Modify Business Agent Durable Object:**

```typescript
// src/business-agent-do.ts
import { Ai } from '@cloudflare/ai';

export class BusinessAgentDO {
  private ai: Ai;
  
  constructor(state: DurableObjectState, env: Env) {
    this.ai = new Ai(env.AI);
  }
  
  async chat(messages: Message[]): Promise<ChatResponse> {
    // Convert OpenAI format to Workers AI format
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: formattedMessages,
        stream: false,
        max_tokens: 1024,
        temperature: 0.7
      });
      
      return {
        content: response.response,
        usage: {
          promptTokens: response.usage?.input_tokens || 0,
          completionTokens: response.usage?.output_tokens || 0
        }
      };
    } catch (error) {
      console.error('Workers AI error:', error);
      // Fallback to OpenAI if Workers AI fails
      return this.fallbackToOpenAI(messages);
    }
  }
  
  private async fallbackToOpenAI(messages: Message[]): Promise<ChatResponse> {
    // Keep OpenAI as backup for 2 weeks
    // Remove after Workers AI is validated
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages
      })
    });
    
    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage,
      fallback: true // Track fallback usage
    };
  }
}
```

### Phase 3: Validation

**Run side-by-side comparison:**

```bash
./scripts/compare-responses.sh
```

**Quality gates (ALL must pass):**
- ✅ 90%+ semantic similarity to OpenAI responses
- ✅ 100% tool calls executed correctly
- ✅ No hallucinations or factual errors
- ✅ Response time < 2s (p95)
- ✅ Cost reduction > 80%

**If ANY gate fails:**
- Document failure patterns
- Adjust prompts or temperature
- Consider Llama 3.3 70B if quality insufficient
- DO NOT deploy to production

### Phase 4: Gradual Rollout

**Deploy incrementally:**

1. **Week 1:** 10% traffic to Workers AI
   ```bash
   wrangler deploy --env staging
   ./scripts/monitor-rollout.sh 0.1
   ```

2. **Week 2:** 50% if metrics good
3. **Week 3:** 100% if no regressions

**Monitor metrics:**
- Response quality scores
- User feedback/complaints
- Error rates
- Fallback usage
- Cost per conversation

### Phase 5: Cleanup

**After 2 weeks at 100% Workers AI:**

```bash
./scripts/remove-openai-fallback.sh
```

- Remove OpenAI API calls
- Delete OPENAI_API_KEY secret
- Update documentation
- Archive baseline tests

## Testing Checklist

**Before deployment:**
- [ ] Baseline captured with 10+ OpenAI queries
- [ ] Test suite passes (20+ scenarios)
- [ ] Side-by-side comparison shows 90%+ quality match
- [ ] Tool calls work identically
- [ ] Error handling tested (rate limits, timeouts)
- [ ] Staging environment validated
- [ ] Rollback script tested
- [ ] Monitoring dashboard configured

**During rollout:**
- [ ] Daily metrics review (quality, errors, costs)
- [ ] User feedback monitored
- [ ] Fallback usage tracked
- [ ] No regressions detected

**Post-migration:**
- [ ] 2 weeks at 100% without issues
- [ ] OpenAI fallback removed
- [ ] Cost savings verified (>80% reduction)
- [ ] Documentation updated

## Common Pitfalls

**Avoid these mistakes:**

1. **Deploying without baseline** - You won't know if quality regressed
2. **Skipping side-by-side testing** - Silent quality loss
3. **No fallback mechanism** - Single point of failure
4. **Rushing rollout** - Gradual is safer
5. **Forgetting to remove OpenAI** - Still paying for unused service

## Success Metrics

**Cost Optimization:**
- Before: ~$0.15 input + $0.60 output per 1M tokens (OpenAI)
- After: $0 (included in Workers Paid plan)
- **Target: >80% cost reduction**

**Quality Maintenance:**
- Semantic similarity: >90%
- Tool execution: 100%
- User satisfaction: No regression

**Performance:**
- Response time: <2s (p95)
- Error rate: <1%
- Uptime: >99.9%

## Rollback Procedure

**If quality issues detected:**

```bash
# Immediate rollback (restores 100% OpenAI)
./scripts/rollback.sh

# Investigate issues
./scripts/analyze-failures.sh

# Fix and retry migration
```

**When to rollback:**
- User complaints increase >20%
- Error rate spikes >5%
- Tool execution failures >2%
- Response quality drops <85%

---

**Remember:** Cost savings mean nothing if quality suffers. Test thoroughly, deploy gradually, monitor obsessively.
