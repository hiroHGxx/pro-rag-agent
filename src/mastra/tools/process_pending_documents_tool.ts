import { createTool } from '@mastra/core';
import { z } from 'zod';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// Convexに接続するための、自前のHTTPクライアント
// crawler-toolから持ってきたものを、このツール内で再定義します。
class ConvexClient {
  private baseUrl: string;

  constructor(convexUrl: string) {
    if (!convexUrl) {
      throw new Error("CONVEX_URL is not set");
    }
    this.baseUrl = convexUrl;
  }

  async query(name: string, args?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name, args: args || {} }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Convex query failed: ${response.statusText}, body: ${errorBody}`);
    }
    const data = await response.json();
    return data.value;
  }

  async mutation(name: string, args?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/mutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name, args: args || {} }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Convex mutation failed: ${response.statusText}, body: ${errorBody}`);
    }
    return response.json();
  }
}


const inputSchema = z.object({});
const outputSchema = z.object({
  totalProcessedPages: z.number(),
  totalStoredChunks: z.number(),
});

export const processPendingDocumentsTool = createTool({
  id: 'process_pending_documents',
  description: 'Convexデータベースから未処理のページを取得し、チャンク化・ベクトル化してdocumentsテーブルに保存します',
  inputSchema,
  outputSchema,
  execute: async () => {
    console.log('[TOOL_START] Processing pending documents...');

    // 1. 必要なクライアントを全て、このツール内で直接初期化する
    const convexClient = new ConvexClient(process.env.CONVEX_URL!);
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
      model: "models/embedding-001",
    });
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    // 2. 未処理のページをDBから取得
    const pendingPages: any[] = await convexClient.query('crawled_pages:getPending');

    if (!pendingPages || pendingPages.length === 0) {
      console.log('[TOOL_INFO] No pending pages to process.');
      return { totalProcessedPages: 0, totalStoredChunks: 0 };
    }
    console.log(`[TOOL_INFO] Found ${pendingPages.length} pending pages to process.`);

    let totalProcessedPages = 0;
    let totalStoredChunks = 0;

    // 3. 各ページをループ処理
    for (const page of pendingPages) {
      try {
        console.log(`[TOOL_PAGE] Processing: ${page.url}`);

        // 4. テキストをチャンク化（ツール内で直接実行）
        const chunks = await textSplitter.splitText(page.text);
        console.log(`[TOOL_PAGE]   - Chunked into ${chunks.length} pieces.`);

        if (chunks && chunks.length > 0) {
          // 5. 各チャンクをベクトル化して保存（ツール内で直接実行）
          for (const chunk of chunks) {
            const vector = await embeddings.embedQuery(chunk);
            await convexClient.mutation('documents:add', {
              text: chunk,
              embedding: vector,
            });
          }
          totalStoredChunks += chunks.length;
          console.log(`[TOOL_PAGE]   - Stored ${chunks.length} new chunks.`);
        }

        // 6. ページのステータスを更新
        await convexClient.mutation('crawled_pages:updateStatus', {
          id: page._id,
          status: 'processed',
        });
        totalProcessedPages++;

      } catch (error) {
        console.error(`[TOOL_ERROR] Failed to process page ${page.url}`, error);
        try {
          await convexClient.mutation('crawled_pages:updateStatus', {
            id: page._id,
            status: 'error',
          });
        } catch (statusError) {
          console.error(`[TOOL_ERROR] Failed to update error status for page ${page.url}`, statusError);
        }
      }
    }

    const summaryMessage = `[TOOL_END] Completed. Processed ${totalProcessedPages} pages, stored a total of ${totalStoredChunks} new chunks.`;
    console.log(summaryMessage);

    return {
      totalProcessedPages,
      totalStoredChunks,
    };
  },
});