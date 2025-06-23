import { createTool } from '@mastra/core';
import { z } from 'zod';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Convexに接続するための、自前のHTTPクライアント
// process_pending_documents_tool.tsからコピー
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

const inputSchema = z.object({
  question: z.string(),
});

const outputSchema = z.string();

export const qnaAnswerTool = createTool({
  id: 'answer_question_from_docs',
  description: 'ユーザーからの質問を受け取り、Convexデータベースに保存されている知識をベクトル検索し、見つかった関連情報に基づいて最終的な回答を生成する完全なRAGパイプライン',
  inputSchema,
  outputSchema,
  execute: async ({ question }) => {
    console.log('[QNA_TOOL] Starting Q&A process for question:', question);

    // 1. ConvexClientとGoogleGenerativeAIEmbeddingsを初期化
    const convexClient = new ConvexClient(process.env.CONVEX_URL!);
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
      model: "models/embedding-001",
    });

    // 2. 入力された質問をベクトル化
    console.log('[QNA_TOOL] Vectorizing question...');
    const questionVector = await embeddings.embedQuery(question);

    // 3. ベクトル検索でDBから関連するドキュメントチャンクを検索
    console.log('[QNA_TOOL] Searching for relevant documents...');
    const searchResults = await convexClient.query('search:byEmbedding', {
      embedding: questionVector,
      limit: 5,
    });

    // 4. 検索結果が0件の場合は、メッセージを返して終了
    if (!searchResults || searchResults.length === 0) {
      console.log('[QNA_TOOL] No relevant documents found.');
      return '申し訳ありませんが、関連する情報が見つかりませんでした。';
    }

    console.log(`[QNA_TOOL] Found ${searchResults.length} relevant documents.`);

    // 5. 検索結果をコンテキストとして一つの文字列にまとめる
    const context = searchResults.map((result: any) => result.text).join('\n\n');

    // 6. GoogleGenerativeAIを初期化してLLMに質問を送信
    console.log('[QNA_TOOL] Generating answer using LLM...');
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });

    const prompt = `あなたは、提供されたコンテキストだけに基づいて、ユーザーの質問に答える、忠実なアシスタントです。

コンテキスト：
${context}

質問：${question}

回答：`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answerText = response.text();

    console.log('[QNA_TOOL] Generated answer successfully.');
    
    // 7. LLMが生成した回答のテキストを最終的な結果として返す
    return answerText;
  },
});