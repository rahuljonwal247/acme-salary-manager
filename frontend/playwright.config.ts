import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against a running stack (web + API + seeded DB).
 *   docker compose --profile app up -d   (or run api + web with npm run dev)
 *   npm run test:e2e
 * Uses the locally installed Edge/Chrome channel, so no browser download is needed.
 */
export default defineConfig({
  testDir: './e2e',
  // Tests share one database; run serially so data assertions are predictable.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'msedge',
    headless: true,
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
