import { z } from 'zod';

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
});

export function parseDatabaseEnvironment(environment: NodeJS.ProcessEnv): {
  databaseUrl: string;
} {
  const parsed = databaseEnvironmentSchema.parse(environment);
  return { databaseUrl: parsed.DATABASE_URL };
}
