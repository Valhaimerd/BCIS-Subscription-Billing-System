import { createDatabaseConnection } from '@bcis/database';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { join } from 'node:path';

import { createApp } from './app.js';
import { AuthService } from './auth.js';
import { BillingService } from './billing.js';
import { CollectionService } from './collections.js';
import { parseApiEnvironment } from './config.js';
import { PostgresAuthRepository } from './postgres-auth-repository.js';
import { MasterDataService } from './master-data.js';
import { rotateLog } from './log-rotation.js';
import { OperationService } from './operations.js';
import { PaymentService } from './payments.js';
import { ReceivableService } from './receivables.js';
import { ReportService } from './reports.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});

const config = parseApiEnvironment(process.env);
const database = createDatabaseConnection(config.DATABASE_URL);
const projectRoot = resolve(import.meta.dirname, '../../../');
const logPath = join(projectRoot, config.LOG_DIRECTORY, 'api.log');
await rotateLog(logPath, config.LOG_MAX_BYTES, config.LOG_RETAINED_FILES);
const authService = new AuthService(new PostgresAuthRepository(database.db), {
  sessionTtlMinutes: config.AUTH_SESSION_TTL_MINUTES,
  maxFailedAttempts: config.AUTH_MAX_FAILED_ATTEMPTS,
  lockoutMinutes: config.AUTH_LOCKOUT_MINUTES,
});
const receivableService = new ReceivableService(database.db);
const app = await createApp({
  checkReadiness: database.isReady,
  authService,
  masterDataService: new MasterDataService(database.db),
  billingService: new BillingService(database.db),
  paymentService: new PaymentService(
    database.db,
    resolve(import.meta.dirname, '../../../', config.ATTACHMENT_DIRECTORY),
  ),
  collectionService: new CollectionService(database.db),
  receivableService,
  reportService: new ReportService(database.db, receivableService),
  operationService: new OperationService(database.db, {
    databaseUrl: config.DATABASE_URL,
    attachmentDirectory: resolve(projectRoot, config.ATTACHMENT_DIRECTORY),
    backupDirectory: resolve(projectRoot, config.BACKUP_DIRECTORY),
    ...(config.POSTGRES_BIN_DIRECTORY
      ? { postgresBinDirectory: config.POSTGRES_BIN_DIRECTORY }
      : {}),
    applicationVersion: '0.1.0',
  }),
  logger: { level: config.LOG_LEVEL, file: logPath },
});

const close = async () => {
  await app.close();
  await database.close();
};

process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  await close();
  process.exitCode = 1;
}
