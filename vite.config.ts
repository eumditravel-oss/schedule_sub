import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

let commitSha = 'unknown';
try {
  commitSha = execSync('git rev-parse HEAD').toString().trim();
} catch (e) {
  // fallback if git command fails
}

const now = new Date();
const kstDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const kstTimeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const buildTimeKst = `${kstDateStr} ${kstTimeStr} KST`;

// Vite config with path alias, Vitest test exclude, build SHA, and dev server setup
export default defineConfig({
  appType: 'spa',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(commitSha),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTimeKst),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://concost-dev-scheduler-qa.eumditravel.workers.dev',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'https://concost-dev-scheduler-qa.eumditravel.workers.dev',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
  },
} as any);
