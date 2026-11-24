import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Overridable so the smoke script (and anyone running two stacks at once) can
// point the proxy at a different API port.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development: no CORS negotiation, no base URL to configure.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setup-tests.ts'],
    restoreMocks: true,
    css: false,
  },
});
