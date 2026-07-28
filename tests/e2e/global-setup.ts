import path from 'node:path';
import { build } from 'vite';

export default async function globalSetup(): Promise<void> {
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      emptyOutDir: false,
      lib: {
        entry: path.resolve('tests/e2e/contenteditable-adapter-entry.ts'),
        formats: ['iife'],
        name: 'ContentEditableAdapterHarness',
      },
      outDir: 'test-results/adapter-harness',
      rollupOptions: {
        output: { entryFileNames: 'contenteditable-adapter.js' },
      },
    },
  });
}
