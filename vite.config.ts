/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// One fixed port for dev, preview and `npm start`. It must match the OAuth
// redirect URL registered in the Twitch developer console, and keeping it fixed
// also keeps saved presets (browser storage is per origin) in one place.
const DEFAULT_PORT = 5757;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.MTV_PORT) || DEFAULT_PORT;
  const server = { host: 'localhost', port, strictPort: true };

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server,
    preview: server,
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
    },
  };
});
