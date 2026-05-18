import { defineConfig } from 'vite';

/**
 * Dev proxy → local service ports. Mirrors the apps/web proxy.
 * Production builds rely on the ingress to rewrite `/api/<svc>` to the
 * corresponding upstream service.
 */
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/api/substrate': { target: 'http://localhost:3002', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/substrate/, '') },
      '/api/telemetry': { target: 'http://localhost:3003', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/telemetry/, '') },
      '/api/recommendations': { target: 'http://localhost:3004', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/recommendations/, '') },
      '/api/test-generator': { target: 'http://localhost:3005', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/test-generator/, '') },
      '/api/discovery': { target: 'http://localhost:3006', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/discovery/, '') },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
