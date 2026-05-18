import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const SUBSTRATE = process.env.AEOS_SUBSTRATE_URL ?? 'http://localhost:3002';
const TELEMETRY = process.env.AEOS_TELEMETRY_URL ?? 'http://localhost:3003';
const RECOMMENDATIONS = process.env.AEOS_RECOMMENDATIONS_URL ?? 'http://localhost:3004';
const TEST_GENERATOR = process.env.AEOS_TEST_GENERATOR_URL ?? 'http://localhost:3005';
const DISCOVERY = process.env.AEOS_DISCOVERY_URL ?? 'http://localhost:3006';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/substrate': {
        target: SUBSTRATE,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/substrate/, ''),
      },
      '/api/telemetry': {
        target: TELEMETRY,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/telemetry/, ''),
      },
      '/api/recommendations': {
        target: RECOMMENDATIONS,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/recommendations/, ''),
      },
      '/api/test-generator': {
        target: TEST_GENERATOR,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/test-generator/, ''),
      },
      '/api/discovery': {
        target: DISCOVERY,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/discovery/, ''),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
});
