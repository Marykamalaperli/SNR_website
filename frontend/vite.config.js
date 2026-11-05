import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { readPublicAuthConfig } from './scripts/public-auth-config.mjs';

export default defineConfig(({ mode }) => {
  // Reject private keys before Vite can embed any environment values in a bundle.
  readPublicAuthConfig(loadEnv(mode, process.cwd(), 'VITE_'), {
    production: mode === 'production',
  });
  return {
    plugins: [react()],
    server: { host: '0.0.0.0' },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
      clearMocks: true,
    },
  };
});
