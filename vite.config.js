import { defineConfig } from 'vite';
export default defineConfig({ server: { allowedHosts: true }, build: { target: 'esnext' }, optimizeDeps: { esbuildOptions: { target: 'esnext' } } });
