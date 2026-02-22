import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'test/'],
      lines: 85,
      functions: 85,
      branches: 80,
      statements: 85,
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
