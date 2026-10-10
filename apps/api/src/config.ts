import { z } from 'zod';

const apiEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  AUTH_SESSION_TTL_MINUTES: z.coerce.number().int().min(5).default(480),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  ATTACHMENT_DIRECTORY: z.string().min(1).default('./storage/attachments'),
  BACKUP_DIRECTORY: z.string().min(1).default('./storage/backups'),
  POSTGRES_BIN_DIRECTORY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  LOG_DIRECTORY: z.string().min(1).default('./storage/logs'),
  LOG_MAX_BYTES: z.coerce.number().int().min(1024).default(5_242_880),
  LOG_RETAINED_FILES: z.coerce.number().int().min(1).max(20).default(5),
});

export type ApiConfig = z.infer<typeof apiEnvironmentSchema>;

export function parseApiEnvironment(environment: NodeJS.ProcessEnv): ApiConfig {
  return apiEnvironmentSchema.parse(environment);
}
