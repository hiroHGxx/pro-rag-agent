import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

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

export const embeddingStorageTool = createTool({
  id: 'embedding_storage',
  description: 'テキストチャンクの配列をベクトル化し、データベースに保存します。',
  inputSchema: z.object({
    chunks: z.array(z.string()).describe('ベクトル化して保存するテキストチャンクの配列'),
  }),
  outputSchema: z.object({
    storedCount: z.number().describe('正常に保存されたチャンクの数'),
  }),
  execute: async ({ context }) => {
    const { chunks } = context;
    
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is required');
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: "models/embedding-001",
    });

    let storedCount = 0;
    for (const chunk of chunks) {
      try {
        const vector = await embeddings.embedQuery(chunk);
        
        // Convex client を使用してmutationを呼び出す
        const client = getConvexClient();
        await client.mutation('documents:add', {
          text: chunk,
          embedding: vector,
        });

        storedCount++;
        console.log(`[STORAGE] Stored chunk: ${chunk.substring(0, 50)}...`);

      } catch (error) {
        console.error(`[STORAGE_ERROR] Failed to store chunk. Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return {
      storedCount,
    };
  },
});