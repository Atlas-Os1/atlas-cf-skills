// KBC Workers AI Migration - Worker Implementation
// Replaces OpenAI GPT-4o-mini with Cloudflare Workers AI Llama 3.1 8B

interface Env {
  AI: Ai;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: Message[];
}

interface ChatResponse {
  response: string;
  model?: string;
  usage?: {
    total_tokens: number;
  };
  tool?: any;
}

function validateMessages(messages: any[]): Message[] | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return null;
    }
    
    if (!['user', 'assistant', 'system'].includes(msg.role)) {
      return null;
    }
  }
  
  return messages as Message[];
}

function formatMessagesForWorkersAI(messages: Message[]): Message[] {
  // Add system message if not present
  if (messages[0]?.role !== 'system') {
    return [
      {
        role: 'system',
        content: `You are a helpful business assistant for KiamichiBizConnect, a local business directory.

You help users with:
- Information about businesses in the Kiamichi region
- Editing website pages and content
- Scheduling social media posts
- Generating business descriptions and marketing content

When users ask you to perform actions like editing pages or scheduling posts, respond with tool requests.`
      },
      ...messages
    ];
  }
  
  return messages;
}

function parseToolRequest(response: string): any | null {
  // Check if response contains tool request
  const toolPatterns = [
    /edit.*page|update.*page|change.*page/i,
    /generate.*content|write.*content/i,
    /schedule.*post|post.*to/i
  ];
  
  for (const pattern of toolPatterns) {
    if (pattern.test(response)) {
      // Extract intent (simplified - real implementation would be more sophisticated)
      if (response.toLowerCase().includes('edit') || response.toLowerCase().includes('update')) {
        return {
          tool: 'edit_page',
          recognized: true
        };
      }
      if (response.toLowerCase().includes('generate') || response.toLowerCase().includes('write')) {
        return {
          tool: 'generate_content',
          recognized: true
        };
      }
      if (response.toLowerCase().includes('schedule')) {
        return {
          tool: 'schedule_post',
          recognized: true
        };
      }
    }
  }
  
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only handle POST requests to /chat
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    const url = new URL(request.url);
    if (url.pathname !== '/chat') {
      return new Response('Not found', { status: 404 });
    }
    
    try {
      const body = await request.json() as ChatRequest;
      
      // Validate messages
      const validatedMessages = validateMessages(body.messages);
      if (!validatedMessages) {
        return Response.json(
          { error: 'Invalid messages format. Must be array of {role, content}' },
          { status: 400 }
        );
      }
      
      // Format messages for Workers AI
      const formattedMessages = formatMessagesForWorkersAI(validatedMessages);
      
      // Call Workers AI
      const aiResponse = await env.AI.run(
        '@cf/meta/llama-3.1-8b-instruct',
        {
          messages: formattedMessages,
          temperature: 0.7,
          max_tokens: 512
        }
      ) as any;
      
      // Parse response
      const responseText = aiResponse.response || '';
      
      // Check for tool requests
      const tool = parseToolRequest(responseText);
      
      // Build response
      const chatResponse: ChatResponse = {
        response: responseText,
        model: 'llama-3.1-8b-instruct',
        usage: {
          total_tokens: aiResponse.usage?.total_tokens || 0
        }
      };
      
      if (tool) {
        chatResponse.tool = tool;
      }
      
      return Response.json(chatResponse);
      
    } catch (error) {
      console.error('Chat error:', error);
      
      // Handle specific errors
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          return Response.json(
            { error: 'Request timeout. Please try again.' },
            { status: 503 }
          );
        }
        
        if (error.message.includes('token')) {
          return Response.json(
            { error: 'Token limit exceeded. Please shorten your message.' },
            { status: 413 }
          );
        }
      }
      
      return Response.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
};
