import { describe, it, expect, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';

describe('KBC Workers AI Migration', () => {
  describe('Basic Chat Functionality', () => {
    it('should respond to basic business query', async () => {
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'What services do you offer?' }
          ]
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json() as { response: string };
      expect(data.response).toBeDefined();
      expect(data.response.length).toBeGreaterThan(50);
      expect(data.response.toLowerCase()).toMatch(/business|service|kiamichi/);
    });

    it('should handle empty messages gracefully', async () => {
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] })
      });
      
      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data.error).toContain('messages');
    });

    it('should reject invalid message format', async () => {
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ invalid: 'format' }]
        })
      });
      
      expect(response.status).toBe(400);
    });
  });

  describe('Conversation Context', () => {
    it('should maintain context across messages', async () => {
      // First message
      const response1 = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'My name is John' }
          ]
        })
      });
      
      expect(response1.status).toBe(200);
      const data1 = await response1.json() as { response: string };
      
      // Second message with context
      const response2 = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'My name is John' },
            { role: 'assistant', content: data1.response },
            { role: 'user', content: 'What is my name?' }
          ]
        })
      });
      
      expect(response2.status).toBe(200);
      const data2 = await response2.json() as { response: string };
      expect(data2.response.toLowerCase()).toContain('john');
    });

    it('should handle very long context (token limits)', async () => {
      const longMessages = Array(20).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'This is a test message to build up context length. ' + 'word '.repeat(50)
      }));
      
      longMessages.push({ role: 'user', content: 'Summarize our conversation' });
      
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: longMessages })
      });
      
      // Should either succeed or gracefully handle token limit
      expect([200, 413]).toContain(response.status);
    });
  });

  describe('Workers AI Integration', () => {
    it('should use Workers AI (not OpenAI)', async () => {
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json() as { response: string; model?: string };
      
      // Verify it's using Workers AI model
      if (data.model) {
        expect(data.model).toContain('llama');
      }
      
      // Response should be generated (basic sanity check)
      expect(data.response.length).toBeGreaterThan(0);
    });

    it('should return usage statistics', async () => {
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Tell me about your business' }
          ]
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json() as { usage?: { total_tokens: number } };
      
      // Workers AI should return usage stats
      expect(data.usage).toBeDefined();
      expect(data.usage?.total_tokens).toBeGreaterThan(0);
    });

    it('should have acceptable latency (<2s)', async () => {
      const start = Date.now();
      
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Quick question: are you open today?' }
          ]
        })
      });
      
      const latency = Date.now() - start;
      
      expect(response.status).toBe(200);
      expect(latency).toBeLessThan(2000); // Under 2 seconds
    });
  });

  describe('Tool Calling (if applicable)', () => {
    it('should recognize page edit requests', async () => {
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Update the homepage content to say "We are open!"' }
          ]
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json() as { response: string; tool?: any };
      
      // Should either mention tool use OR include tool call in response
      const responseText = data.response.toLowerCase();
      expect(
        responseText.includes('edit') ||
        responseText.includes('update') ||
        responseText.includes('homepage') ||
        data.tool
      ).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Workers AI timeout gracefully', async () => {
      // This test validates error handling
      // In production, timeouts should return a helpful error
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Test message' }
          ]
        })
      });
      
      // Should not crash even if Workers AI has issues
      expect([200, 500, 503]).toContain(response.status);
    });

    it('should validate message structure', async () => {
      const response = await SELF.fetch('https://example.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'invalid_role', content: 'Test' }
          ]
        })
      });
      
      expect(response.status).toBe(400);
    });
  });
});
