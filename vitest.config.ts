import { defineConfig } from 'vitest/config';

// Single source of truth for local and CI: thresholds live here so every command applies them.
export default defineConfig({
  test: {
    restoreMocks: true,
    // Integration files share one ephemeral Mongo and clean collections between tests, so files run serially.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      // Floor = measured coverage at setup (79.36 / 79.36 / 80 / 87.5) rounded down. Raise only, via a DEC.
      thresholds: { lines: 79, statements: 79, branches: 80, functions: 87 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['tests/integration/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/globalSetup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 30000,
          hookTimeout: 120000,
        },
      },
    ],
  },
});
