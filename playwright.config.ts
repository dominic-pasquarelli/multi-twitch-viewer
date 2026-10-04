import { defineConfig, devices } from '@playwright/test';

// End-to-end tests need no Twitch account or network access:
//  - "mock" runs the app with fake Twitch data and fake players;
//  - "twitch" runs the real build and stubs Twitch's servers in the browser,
//    covering the real login, API and embed code paths.
const PORT = 5758;
const REAL_PORT = 5759;
const chromium = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1600, height: 900 },
  // Optional: point at an already-installed Chromium instead of downloading one.
  launchOptions: process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH }
    : undefined,
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mock',
      testMatch: [
        'viewer.spec.ts',
        'qol.spec.ts',
        'temporary.spec.ts',
        'sweep1.spec.ts',
        'sidebar.spec.ts',
      ],
      use: { ...chromium, baseURL: `http://localhost:${PORT}` },
    },
    {
      // Electron uses the same isolated mock build as the browser tests.
      name: 'desktop',
      testMatch: 'desktop.spec.ts',
    },
    {
      name: 'twitch',
      testMatch: 'twitch-integration.spec.ts',
      use: { ...chromium, baseURL: `http://localhost:${REAL_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx vite build --mode mock --outDir dist-e2e/mock && npx vite preview --mode mock --outDir dist-e2e/mock --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { MTV_PORT: String(PORT) },
    },
    {
      command: `npx vite build --outDir dist-e2e/real && npx vite preview --outDir dist-e2e/real --port ${REAL_PORT}`,
      url: `http://localhost:${REAL_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { MTV_PORT: String(REAL_PORT), VITE_TWITCH_CLIENT_ID: 'e2etestclientid0000000000000' },
    },
  ],
});
