import { defineConfig } from 'vite';

// This URL is only used by the Vite server; browsers call the relative /api path.
const rhymeApi = process.env.RHYME_API_URL || 'http://127.0.0.1:8002';
export default defineConfig({
  server: { allowedHosts: true, cors: true, proxy: { '/api': rhymeApi } },
  preview: { cors: true, proxy: { '/api': rhymeApi } },
  build: { target: 'esnext' }, optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
