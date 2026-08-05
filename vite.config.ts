import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

let commitSha = 'unknown';
try {
  commitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  // fallback if git command fails
}

// Vite config with path alias, Vitest test exclude, build SHA, and dev server setup
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(commitSha),
  },
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
