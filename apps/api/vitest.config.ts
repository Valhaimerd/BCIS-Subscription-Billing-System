import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@bcis/contracts': resolve('../../packages/contracts/src/index.ts'),
      '@bcis/database': resolve('../../packages/database/src/index.ts'),
    },
  },
});
