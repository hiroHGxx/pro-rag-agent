import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { weatherTool } from '../tools/weather-tool';
import { addMessageTool, listMessagesTool } from '../tools/convex-tool';
import { crawlerTool } from '../tools/crawler-tool';
import { chunkerTool } from '../tools/chunker-tool';
import { embeddingStorageTool } from '../tools/embedding-storage-tool';
import { processPendingDocumentsTool } from '../tools/process_pending_documents_tool';
import { qnaAnswerTool } from '../tools/qna_tool';
import { processPendingDocumentsWorkflow } from '../workflows/process-crawled-data.workflow';
import { ingestPipelineWorkflow } from '../workflows/ingest-pipeline.workflow';

export const generalAgent = new Agent({
  name: 'General_Assistant',
  instructions: `あなたは、与えられたツールを駆使して、ユーザーのあらゆる指示に対応する、非常に優秀な汎用アシスタントです。ユーザーの指示の意図を正確に分析し、最も適切と思われるツールを一つ、あるいは複数組み合わせて、問題を解決してください。結果は常に日本語で、分かりやすく報告してください。`,
  model: google('gemini-1.5-pro-latest'),
  tools: { weatherTool, addMessageTool, listMessagesTool, crawlerTool, chunkerTool, embeddingStorageTool, processPendingDocumentsTool, qnaAnswerTool },
  workflows: { processPendingDocumentsWorkflow, ingestPipelineWorkflow },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
});