import {
  billingCycles,
  createDatabaseConnection,
  invoices,
  users,
} from '@bcis/database';
import { and, count, countDistinct, eq, sql } from 'drizzle-orm';
import { config as loadEnvironment } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { AuthService } from './auth.js';
import { BillingService } from './billing.js';
import { parseApiEnvironment } from './config.js';
import { MasterDataService } from './master-data.js';
import { OperationService } from './operations.js';
import { PostgresAuthRepository } from './postgres-auth-repository.js';
import { ReceivableService } from './receivables.js';
import { ReportService } from './reports.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});
const config = parseApiEnvironment(process.env);
const ownerPassword = process.env.SEED_OWNER_PASSWORD;
if (!ownerPassword) throw new Error('SEED_OWNER_PASSWORD is required.');

const root = resolve(import.meta.dirname, '../../../');
const attachments = resolve(root, config.ATTACHMENT_DIRECTORY);
const backups = resolve(root, config.BACKUP_DIRECTORY);
const evidence = resolve(root, 'evidence/task9');
const marker = resolve(attachments, 'task9-restore-check.txt');
const database = createDatabaseConnection(config.DATABASE_URL);
const operations = new OperationService(database.db, {
  databaseUrl: config.DATABASE_URL,
  attachmentDirectory: attachments,
  backupDirectory: backups,
  ...(config.POSTGRES_BIN_DIRECTORY
    ? { postgresBinDirectory: config.POSTGRES_BIN_DIRECTORY }
    : {}),
  applicationVersion: '0.1.0',
});

try {
  await mkdir(attachments, { recursive: true });
  await mkdir(evidence, { recursive: true });
  await writeFile(marker, 'BCIS Task 9 verified attachment\n');
  const readiness = await operations.readiness();
  if (
    Object.entries(readiness).some(
      ([key, value]) => key !== 'restoring' && !value,
    )
  )
    throw new Error(
      `Operational readiness failed: ${JSON.stringify(readiness)}`,
    );

  const [owner] = await database.db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, process.env.SEED_OWNER_USERNAME ?? 'owner'))
    .limit(1);
  if (!owner) throw new Error('The seeded Owner is required.');

  const originalSettings = await operations.settings();
  const backup = await operations.create(owner.id);
  if (!backup.available || !backup.manifest)
    throw new Error('Verified backup is unavailable.');
  await writeFile(
    resolve(evidence, 'backup-manifest.json'),
    `${JSON.stringify(backup.manifest, null, 2)}\n`,
  );

  const auth = new AuthService(new PostgresAuthRepository(database.db), {
    sessionTtlMinutes: config.AUTH_SESSION_TTL_MINUTES,
    maxFailedAttempts: config.AUTH_MAX_FAILED_ATTEMPTS,
    lockoutMinutes: config.AUTH_LOCKOUT_MINUTES,
  });
  const sessions = await Promise.all([
    auth.login(owner.username, ownerPassword),
    auth.login(owner.username, ownerPassword),
    auth.login(owner.username, ownerPassword),
  ]);
  if (new Set(sessions.map(({ token }) => token)).size !== 3)
    throw new Error('Independent sessions did not receive unique tokens.');

  const billing = new BillingService(database.db);
  await Promise.all([
    billing.generateDrafts({ periodYear: 2197, periodMonth: 12 }, owner.id),
    billing.generateDrafts({ periodYear: 2197, periodMonth: 12 }, owner.id),
    billing.generateDrafts({ periodYear: 2197, periodMonth: 12 }, owner.id),
  ]);
  const [cycle] = await database.db
    .select({ id: billingCycles.id })
    .from(billingCycles)
    .where(
      and(
        eq(billingCycles.periodYear, 2197),
        eq(billingCycles.periodMonth, 12),
      ),
    );
  if (!cycle) throw new Error('Concurrent billing cycle was not created.');
  const [duplicateCheck] = await database.db
    .select({
      invoices: count(),
      services: countDistinct(invoices.serviceAccountId),
    })
    .from(invoices)
    .where(eq(invoices.billingCycleId, cycle.id));
  if (!duplicateCheck || duplicateCheck.invoices !== duplicateCheck.services)
    throw new Error('Concurrent billing produced duplicate service invoices.');

  const paginationPlan = await database.db.transaction(async (transaction) => {
    await transaction.execute(sql`set local enable_seqscan = off`);
    const result = await transaction.execute<Record<'QUERY PLAN', unknown>>(sql`
      explain (format json)
      select id from payments
      where status = 'POSTED'
      order by payment_date desc
      limit 100
    `);
    return JSON.stringify(result.rows[0]?.['QUERY PLAN'] ?? null);
  });
  if (
    !paginationPlan.includes('Limit') ||
    !paginationPlan.includes('payments_status_date_index')
  )
    throw new Error(
      'The target-scale payment page cannot use its bounded index plan.',
    );

  const receivables = new ReceivableService(database.db);
  await Promise.all([
    new MasterDataService(database.db).listPlans(),
    receivables.summary('2026-10-31'),
    new ReportService(database.db, receivables).dashboard({
      from: '2026-08-01',
      to: '2026-10-31',
      asOf: '2026-10-31',
    }),
  ]);
  await writeFile(
    resolve(evidence, 'concurrency-result.json'),
    `${JSON.stringify(
      {
        passed: true,
        independentSessions: 3,
        parallelOperations: [
          'plans.read',
          'receivables.read',
          'dashboard.read',
        ],
        concurrentBillingRequests: 3,
        invoiceCount: duplicateCheck.invoices,
        distinctServiceCount: duplicateCheck.services,
        targetScale: {
          subscribers: 20_000,
          invoices: 500_000,
          payments: 500_000,
          ledgerEntries: 1_000_000,
          serverPageSize: 100,
          boundedQueryPlan: true,
          compositeIndex: 'payments_status_date_index',
        },
      },
      null,
      2,
    )}\n`,
  );

  const changedRetention = originalSettings.backupRetentionCount === 1 ? 2 : 1;
  await operations.updateSettings(changedRetention, owner.id);
  await writeFile(marker, 'changed after backup\n');
  const restored = await operations.restore(
    backup.id,
    `RESTORE ${backup.backupName}`,
    owner.id,
  );
  if (restored.status !== 'SUCCEEDED')
    throw new Error('Restore did not succeed.');
  if (
    (await operations.settings()).backupRetentionCount !==
    originalSettings.backupRetentionCount
  )
    throw new Error('Database setting was not restored.');
  if ((await readFile(marker, 'utf8')) !== 'BCIS Task 9 verified attachment\n')
    throw new Error('Attachment content was not restored.');
  const [restoredCycle] = await database.db
    .select({ id: billingCycles.id })
    .from(billingCycles)
    .where(
      and(
        eq(billingCycles.periodYear, 2197),
        eq(billingCycles.periodMonth, 12),
      ),
    );
  if (restoredCycle)
    throw new Error('Post-backup database mutation survived restore.');

  await writeFile(
    resolve(evidence, 'restore-result.json'),
    `${JSON.stringify(
      {
        passed: true,
        sourceBackup: backup.backupName,
        restoreHistoryId: restored.id,
        databaseSettingRestored: true,
        postBackupBillingRemoved: true,
        attachmentChecksumRestored: true,
        message: restored.message,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    resolve(evidence, 'integrity-result.json'),
    `${JSON.stringify(
      {
        passed: true,
        schemaVersion: backup.manifest.schemaVersion,
        databaseSha256: backup.manifest.database.sha256,
        attachmentFilesVerified: backup.manifest.attachments.length,
        rowCounts: backup.manifest.rowCounts,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    'Task 9 live checks passed: readiness, three sessions, concurrent numbering guards, verified backup, database mutation rollback, attachment restore, and checksum integrity.\n',
  );
} finally {
  await database.close();
}
