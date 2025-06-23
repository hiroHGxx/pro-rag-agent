import { createStep, createWorkflow } from '@mastra/core';
import { z } from 'zod';

const helloWorldStep = createStep({
  id: 'hello_world_step',
  inputSchema: z.object({}),
  outputSchema: z.string(),
  // asyncキーワードをここに追加
  execute: async () => {
    console.log('[HELLO_WORLD_TEST] Step is executing!');
    return 'Hello, Workflow!';
  },
});

export const processPendingDocumentsWorkflow = createWorkflow({
  id: 'process_pending_documents',
  inputSchema: z.object({}),
  outputSchema: z.string(),
}).then(helloWorldStep);