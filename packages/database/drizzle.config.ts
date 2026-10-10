import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

config({
  path: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../.env'),
  quiet: true,
});

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run Drizzle commands.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: '../../database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
