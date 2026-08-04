import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite config with path alias, Vitest test exclude, and dev server setup
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
  },
} as any);
