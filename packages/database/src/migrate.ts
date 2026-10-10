import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabaseConnection } from './client.js';
import { parseDatabaseEnvironment } from './config.js';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { databaseUrl } = parseDatabaseEnvironment(process.env);
const connection = createDatabaseConnection(databaseUrl);

try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(
      new URL('../../../database/migrations', import.meta.url),
    ),
  });
} finally {
  await connection.close();
}
