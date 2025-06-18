import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface ConvexHttpClient {
  query(name: string, args?: any): Promise<any>;
  mutation(name: string, args?: any): Promise<any>;
}

class ConvexClient implements ConvexHttpClient {
  private baseUrl: string;

  constructor(convexUrl: string) {
    this.baseUrl = convexUrl;
  }

  async query(name: string, args?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: name,
        args: args || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Convex query failed: ${response.statusText}`);
    }

    return response.json();
  }

  async mutation(name: string, args?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/mutation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: name,
        args: args || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Convex mutation failed: ${response.statusText}`);
    }

    return response.json();
  }
}

const getConvexClient = (): ConvexClient => {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is required');
  }
  return new ConvexClient(convexUrl);
};

export const addMessageTool = createTool({
  id: 'add-message',
  description: 'Convexデータベースに、新しいメッセージを書き込みます。',
  inputSchema: z.object({
    author: z.string().describe('メッセージの作成者'),
    body: z.string().describe('メッセージの内容'),
  }),
  outputSchema: z.object({
    id: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ context }) => {
    const client = getConvexClient();
    const result = await client.mutation('messages:send', {
      author: context.author,
      body: context.body,
    });
    
    return {
      id: result.id || result._id || 'unknown',
      success: true,
    };
  },
});

export const listMessagesTool = createTool({
  id: 'list-messages',
  description: 'Convexデータベースにある全てのメッセージを取得します。',
  inputSchema: z.object({}),
  outputSchema: z.array(z.object({
    id: z.string(),
    author: z.string(),
    body: z.string(),
    _creationTime: z.number().optional(),
  })),
  execute: async () => {
    const client = getConvexClient();
    const messages = await client.query('messages:list');
    
    return messages.value.map((msg: any) => ({
      id: msg.id || msg._id || 'unknown',
      author: msg.author,
      body: msg.body,
      _creationTime: msg._creationTime,
    }));
  },
});