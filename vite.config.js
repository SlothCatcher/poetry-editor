import { defineConfig } from 'vite';
export default defineConfig({
  server: { allowedHosts: true, proxy: { '/api': 'http://127.0.0.1:8002' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8002' } },
  build: { target: 'esnext' }, optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
