import { defineConfig } from 'vitest/config';

/**
 * Integration tests run the real Prisma repositories against Postgres, in an isolated `test` schema
 * so they never touch seeded data. Requires the docker-compose DB (or TEST_DATABASE_URL).
 */
const url =
  process.env.TEST_DATABASE_URL ?? 'postgresql://acme:acme@localhost:5434/salaries?schema=integration_test';

// Set on the main process too: globalSetup (migrations) does not receive `test.env`.
process.env.DATABASE_URL = url;

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    env: { DATABASE_URL: url },
    globalSetup: ['./src/testing/integrationSetup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
