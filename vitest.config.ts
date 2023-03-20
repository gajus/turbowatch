import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    singleThread: true,
    testTimeout: 5_000,
  },
});
