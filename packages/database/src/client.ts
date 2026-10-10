import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

export interface DatabaseConnection {
  db: ReturnType<typeof drizzle<typeof schema>>;
  isReady: () => Promise<void>;
  close: () => Promise<void>;
}

export function createDatabaseConnection(
  databaseUrl: string,
): DatabaseConnection {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });

  return {
    db: drizzle(pool, { schema }),
    async isReady() {
      await pool.query('select 1');
    },
    async close() {
      await pool.end();
    },
  };
}
