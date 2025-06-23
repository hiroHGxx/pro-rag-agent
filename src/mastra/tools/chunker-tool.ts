import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

export const chunkerTool = createTool({
  id: 'text_chunker',
  description: '長いテキストを意味のあるチャンクに分割します。',
  inputSchema: z.object({
    content: z.string(),
  }),
  outputSchema: z.array(z.string()),
  execute: async ({ context }) => {
    const { content } = context;
    
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await splitter.splitText(content);
    
    return chunks;
  },
});