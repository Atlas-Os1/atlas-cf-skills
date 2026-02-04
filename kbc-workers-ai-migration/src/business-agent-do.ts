import { Ai } from '@cloudflare/ai';

export interface Env {
  AI: any;
  OPENAI_API_KEY: string;
  ENABLE_WORKERS_AI: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  fallback?: boolean;
  model?: string;
}

export class BusinessAgentDO {
  private state: DurableObjectState;
  private env: Env;
  private ai: Ai;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.ai = new Ai(env.AI);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle chat endpoint
    if (url.pathname === '/chat' && request.method === 'POST') {
      try {
        const { messages } = await request.json() as { messages: Message[] };
        const response = await this.chat(messages);
        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle metrics endpoint
    if (url.pathname === '/metrics' && request.method === 'GET') {
      const metrics = await this.getMetrics();
      return new Response(JSON.stringify(metrics), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    // Check if Workers AI is enabled (for gradual rollout)
    const useWorkersAI = this.env.ENABLE_WORKERS_AI === 'true';

    try {
      if (useWorkersAI) {
        return await this.chatWithWorkersAI(messages);
      } else {
        return await this.chatWithOpenAI(messages);
      }
    } catch (error) {
      console.error('Primary model error:', error);
      
      // Fallback mechanism
      if (useWorkersAI) {
        console.warn('Workers AI failed, falling back to OpenAI');
        await this.incrementMetric('fallback_count');
        return await this.chatWithOpenAI(messages);
      } else {
        throw error;
      }
    }
  }

  private async chatWithWorkersAI(messages: Message[]): Promise<ChatResponse> {
    await this.incrementMetric('workers_ai_requests');

    const startTime = Date.now();
    
    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        stream: false,
        max_tokens: 1024,
        temperature: 0.7
      });

      const duration = Date.now() - startTime;
      await this.recordResponseTime(duration);

      return {
        content: response.response || '',
        usage: {
          promptTokens: response.usage?.input_tokens || 0,
          completionTokens: response.usage?.output_tokens || 0
        },
        model: 'llama-3.1-8b-instruct'
      };
    } catch (error) {
      await this.incrementMetric('workers_ai_errors');
      throw error;
    }
  }

  private async chatWithOpenAI(messages: Message[]): Promise<ChatResponse> {
    await this.incrementMetric('openai_requests');

    const startTime = Date.now();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.7,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;
      await this.recordResponseTime(duration);

      return {
        content: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens
        },
        model: 'gpt-4o-mini'
      };
    } catch (error) {
      await this.incrementMetric('openai_errors');
      throw error;
    }
  }

  // Metrics tracking
  private async incrementMetric(metric: string): Promise<void> {
    const current = (await this.state.storage.get<number>(metric)) || 0;
    await this.state.storage.put(metric, current + 1);
    await this.incrementMetric('total_requests');
  }

  private async recordResponseTime(durationMs: number): Promise<void> {
    // Calculate rolling average
    const times = (await this.state.storage.get<number[]>('response_times')) || [];
    times.push(durationMs);
    
    // Keep last 100 response times
    if (times.length > 100) {
      times.shift();
    }
    
    await this.state.storage.put('response_times', times);
    
    const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
    await this.state.storage.put('avg_response_time_ms', Math.round(avg));
  }

  private async getMetrics() {
    const totalRequests = (await this.state.storage.get<number>('total_requests')) || 0;
    const workersAIRequests = (await this.state.storage.get<number>('workers_ai_requests')) || 0;
    const openaiRequests = (await this.state.storage.get<number>('openai_requests')) || 0;
    const fallbackCount = (await this.state.storage.get<number>('fallback_count')) || 0;
    const workersAIErrors = (await this.state.storage.get<number>('workers_ai_errors')) || 0;
    const openaiErrors = (await this.state.storage.get<number>('openai_errors')) || 0;
    const avgResponseTime = (await this.state.storage.get<number>('avg_response_time_ms')) || 0;

    const totalErrors = workersAIErrors + openaiErrors;
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    return {
      total_requests: totalRequests,
      workers_ai_requests: workersAIRequests,
      openai_requests: openaiRequests,
      fallback_count: fallbackCount,
      workers_ai_errors: workersAIErrors,
      openai_errors: openaiErrors,
      error_rate: Math.round(errorRate * 100) / 100,
      avg_response_time_ms: avgResponseTime
    };
  }
}

export default BusinessAgentDO;
