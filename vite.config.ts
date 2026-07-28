import { defineConfig } from 'vite';
export default defineConfig({ build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: { background: 'src/background/index.ts', sidepanel: 'src/sidepanel/entry.ts' }, output: { entryFileNames: '[name].js', format: 'es' } } } });
