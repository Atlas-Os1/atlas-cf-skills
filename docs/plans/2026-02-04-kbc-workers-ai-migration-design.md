# KBC Workers AI Migration - Detailed Design

**Date:** 2026-02-04
**Priority:** 2 of 3
**Complexity:** Low
**Value:** High (direct cost savings)

---

## Problem Statement

KiamichiBizConnect business agent currently uses OpenAI GPT-4o-mini for chat functionality:
- Cost: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- External API dependency (latency + reliability)
- Not leveraging Cloudflare's edge infrastructure

**Current Architecture:**
```
User → Business Agent Worker
      → OpenAI API (external)
      → Response
```

---

## Goals

### Primary
1. **Replace OpenAI with Workers AI** (Llama 3.1 8B)
2. **Maintain functionality** (same quality responses)
3. **Reduce costs** by 75-90%
4. **Improve latency** (edge inference vs external API)

### Secondary
5. Eliminate external API dependency
6. Simplify configuration (no OpenAI API key needed)
7. Enable future Workers AI features (embeddings, image gen)

---

## Cost Analysis

### Current (OpenAI GPT-4o-mini)
```
Input:  $0.15 per 1M tokens
Output: $0.60 per 1M tokens
Avg conversation: ~500 input + ~200 output tokens
Cost per conversation: ~$0.00019

Estimated monthly usage:
- 10,000 conversations/month
- Cost: ~$1.90/month
```

### Proposed (Workers AI Llama 3.1 8B)
```
Cost: $0.011 per 1M neurons (~tokens)
Avg conversation: ~700 neurons
Cost per conversation: ~$0.000008

Estimated monthly usage:
- 10,000 conversations/month
- Cost: ~$0.08/month
```

**Savings:** $1.82/month (96% reduction)

*(Note: While absolute savings are modest, this validates the pattern for larger deployments)*

---

## Architecture

### Before (OpenAI)
```typescript
// business-agent/src/index.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [...conversationHistory],
  temperature: 0.7
});
```

### After (Workers AI)
```typescript
// business-agent/src/index.ts
const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
  messages: [...conversationHistory],
  temperature: 0.7
});
```

**Key Changes:**
- Remove OpenAI npm package
- Remove OPENAI_API_KEY secret
- Add AI binding to wrangler.toml
- Update prompt formatting (if needed)
- Adjust response parsing

---

## Implementation Plan

### Phase 1: Setup & Testing Framework

**Update wrangler.toml:**
```toml
[ai]
binding = "AI"
```

**Test Suite:**
```typescript
// tests/workers-ai-migration.test.ts
import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';

describe('Workers AI Migration', () => {
  it('should respond to basic business query', async () => {
    const response = await SELF.fetch('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'What services do you offer?' }
        ]
      })
    });
    
    const data = await response.json();
    expect(data.response).toBeDefined();
    expect(data.response.length).toBeGreaterThan(50);
  });
  
  it('should handle multi-turn conversation', async () => {
    // Test conversation context
  });
  
  it('should invoke tools when needed', async () => {
    // Test tool calling (if applicable)
  });
});
```

### Phase 2: Core Migration

**Worker Changes:**
```typescript
interface Env {
  AI: Ai;
  KBC_DB: D1Database;
  // Remove: OPENAI_API_KEY
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { messages } = await request.json();
    
    // Format messages for Workers AI
    const formattedMessages = formatForWorkersAI(messages);
    
    // Call Workers AI
    const response = await env.AI.run(
      '@cf/meta/llama-3.1-8b-instruct',
      {
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 512
      }
    );
    
    return Response.json({
      response: response.response,
      usage: response.usage
    });
  }
};
```

**Message Formatting:**
```typescript
function formatForWorkersAI(messages: ChatMessage[]): Message[] {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    // Workers AI may need different format than OpenAI
  }));
}
```

### Phase 3: Tool Integration (if needed)

KBC business agent has tools for:
- Page editing
- Content generation  
- Social scheduling

**Workers AI doesn't support tool calling directly**, so we need to:
1. Include tool descriptions in system prompt
2. Parse tool requests from response
3. Execute tools manually
4. Return results in next message

**Tool Prompt Pattern:**
```typescript
const systemPrompt = `
You are a business assistant for KiamichiBizConnect.

Available tools:
- edit_page(page_id, content) - Update website page content
- generate_content(topic, type) - Generate blog post or description
- schedule_post(platform, content, time) - Schedule social media post

To use a tool, respond with JSON:
{"tool": "edit_page", "params": {"page_id": "home", "content": "..."}}
`;
```

### Phase 4: Quality Validation

**Comparison Testing:**
1. Run 100 test queries through both OpenAI and Workers AI
2. Compare response quality (manual review)
3. Measure latency differences
4. Validate tool calling accuracy

**Metrics:**
- Response relevance (1-5 scale)
- Response completeness (1-5 scale)
- Tool selection accuracy (% correct)
- Latency (p50, p95, p99)

---

## Testing Strategy (TDD)

### Test 1: Basic Chat
```typescript
test('responds to business inquiry', async () => {
  const response = await businessAgent.chat({
    messages: [{ role: 'user', content: 'What are your hours?' }]
  });
  expect(response).toContain('hours');
  expect(response.length).toBeGreaterThan(20);
});
```

### Test 2: Context Retention
```typescript
test('maintains conversation context', async () => {
  const conv = new Conversation();
  await conv.send('My name is John');
  const response = await conv.send('What is my name?');
  expect(response.toLowerCase()).toContain('john');
});
```

### Test 3: Tool Calling
```typescript
test('recognizes tool request', async () => {
  const response = await businessAgent.chat({
    messages: [{ role: 'user', content: 'Update the homepage content' }]
  });
  expect(parseToolCall(response)).toEqual({
    tool: 'edit_page',
    params: expect.objectContaining({ page_id: expect.any(String) })
  });
});
```

### Test 4: Edge Cases
```typescript
test('handles empty messages', async () => {
  const response = await businessAgent.chat({ messages: [] });
  expect(response.error).toBeDefined();
});

test('handles very long context', async () => {
  const longMessages = Array(50).fill({ role: 'user', content: 'test' });
  const response = await businessAgent.chat({ messages: longMessages });
  expect(response).toBeDefined();
});
```

---

## Rollout Plan

### Stage 1: Shadow Mode (Week 1)
- Deploy Workers AI alongside OpenAI
- 10% of traffic to Workers AI (A/B test)
- Compare responses and quality
- Monitor errors and latency

### Stage 2: Gradual Rollout (Week 2)
- 50% traffic to Workers AI
- Validate cost savings
- Monitor user satisfaction
- Fine-tune prompts if needed

### Stage 3: Full Migration (Week 3)
- 100% traffic to Workers AI
- Remove OpenAI dependency
- Delete OPENAI_API_KEY secret
- Update documentation

### Stage 4: Optimization (Week 4)
- Analyze Workers AI logs
- Optimize prompts for Llama
- Add caching for common queries
- Monitor cost savings

---

## Rollback Plan

**If Workers AI quality is insufficient:**
1. Revert wrangler.toml to use OpenAI binding
2. Re-add OPENAI_API_KEY secret
3. Deploy previous version
4. Time to rollback: <5 minutes

**Criteria for rollback:**
- Response quality drops below 3.5/5
- Error rate > 5%
- User complaints > 10% of sessions
- Latency p95 > 2 seconds

---

## Success Criteria

1. **Cost Reduction:** 75%+ savings vs OpenAI
2. **Quality:** Response quality >= OpenAI (avg 4/5)
3. **Latency:** p95 < 500ms (faster than OpenAI)
4. **Reliability:** Error rate < 1%
5. **Tools:** 95%+ tool calling accuracy

---

## Deployment Checklist

- [ ] Write all tests (4+ test cases above)
- [ ] Implement Workers AI integration
- [ ] Verify all tests pass (GREEN)
- [ ] Deploy to staging environment
- [ ] Run comparison testing (100 queries)
- [ ] A/B test with 10% traffic
- [ ] Monitor metrics for 24 hours
- [ ] Gradual rollout to 50%, then 100%
- [ ] Remove OpenAI dependency
- [ ] Document migration process
- [ ] Create SKILL.md for future migrations

---

## Future Enhancements

1. **Fine-tuning** - Custom Llama model trained on KBC data
2. **Embeddings** - Semantic search for business listings
3. **Image Generation** - Business card designs, logos
4. **Voice** - Workers AI STT/TTS for voice agent

---

**Status:** Design complete, ready for TDD implementation
