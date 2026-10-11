import type {
  ApplicationSettingsDto,
  BackupHistoryDto,
  BackupManifestDto,
  OperationsReadinessDto,
  Paginated,
  RestorePreviewDto,
} from '@bcis/contracts';
import {
  applicationSettings,
  backupHistory,
  type DatabaseConnection,
} from '@bcis/database';
import { desc, eq, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

import {
  assertBackupName,
  expectedRestoreConfirmation,
  isManifestCompatible,
} from './backup-rules.js';

type Database = DatabaseConnection['db'];
type Operation = 'BACKUP' | 'SAFETY_BACKUP' | 'RESTORE';

const manifestSchema = z.object({
  formatVersion: z.literal(1),
  applicationVersion: z.string(),
  schemaVersion: z.string(),
  createdAt: z.iso.datetime(),
  database: z.object({
    file: z.literal('database.dump'),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  attachments: z.array(
    z.object({
      path: z.string().min(1),
      sizeBytes: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  rowCounts: z.record(z.string(), z.number().int().nonnegative()),
});

export class OperationError extends Error {
  constructor(
    public readonly statusCode: 404 | 409 | 503,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface OperationConfig {
  databaseUrl: string;
  attachmentDirectory: string;
  backupDirectory: string;
  postgresBinDirectory?: string;
  applicationVersion: string;
}

const safeDirectory = (path: string) => {
  const full = resolve(path);
  const root = resolve(full, sep);
  if (full === root || full === resolve(process.cwd()))
    throw new Error('Operational storage must use a dedicated directory.');
  return full;
};

async function sha256(path: string) {
  const handle = await open(path, 'r');
  const hash = createHash('sha256');
  try {
    for await (const chunk of handle.readableWebStream())
      hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

async function filesUnder(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Symbolic links are not allowed in attachment storage.');
    if (entry.isDirectory()) files.push(...(await filesUnder(root, path)));
    else if (entry.isFile())
      files.push(relative(root, path).replaceAll('\\', '/'));
  }
  return files.sort();
}

const toolName = (name: 'pg_dump' | 'pg_restore') =>
  process.platform === 'win32' ? `${name}.exe` : name;

export class OperationService {
  private readonly attachments: string;
  private readonly backups: string;
  private restoring = false;

  constructor(
    private readonly db: Database,
    private readonly config: OperationConfig,
  ) {
    this.attachments = safeDirectory(config.attachmentDirectory);
    this.backups = safeDirectory(config.backupDirectory);
  }

  isRestoring = () => this.restoring;

  async readiness(): Promise<OperationsReadinessDto> {
    const [
      databaseReady,
      attachmentStorageReady,
      backupStorageReady,
      postgresToolsReady,
    ] = await Promise.all([
      this.schemaVersion()
        .then(() => true)
        .catch(() => false),
      this.directoryWritable(this.attachments),
      this.directoryWritable(this.backups),
      Promise.all([
        this.runTool('pg_dump', ['--version']),
        this.runTool('pg_restore', ['--version']),
      ])
        .then(() => true)
        .catch(() => false),
    ]);
    return {
      databaseReady,
      attachmentStorageReady,
      backupStorageReady,
      postgresToolsReady,
      restoring: this.restoring,
    };
  }

  async settings(): Promise<ApplicationSettingsDto> {
    await this.ensureSettings();
    const [row] = await this.db.select().from(applicationSettings).limit(1);
    if (!row)
      throw new OperationError(503, 'Operational settings are unavailable.');
    return {
      backupRetentionCount: row.backupRetentionCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateSettings(
    backupRetentionCount: number,
    actorUserId: string,
  ): Promise<ApplicationSettingsDto> {
    await this.ensureSettings();
    const [row] = await this.db
      .update(applicationSettings)
      .set({
        backupRetentionCount,
        updatedByUserId: actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(applicationSettings.id, 1))
      .returning();
    if (!row)
      throw new OperationError(503, 'Operational settings are unavailable.');
    return {
      backupRetentionCount: row.backupRetentionCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<Paginated<BackupHistoryDto>> {
    const offset = (page - 1) * pageSize;
    const [rows, [count]] = await Promise.all([
      this.db
        .select()
        .from(backupHistory)
        .orderBy(desc(backupHistory.completedAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ value: sql<number>`count(*)::int` }).from(backupHistory),
    ]);
    return {
      items: await Promise.all(rows.map((row) => this.toDto(row))),
      page,
      pageSize,
      total: count?.value ?? 0,
    };
  }

  async create(actorUserId: string) {
    if (this.restoring)
      throw new OperationError(409, 'A restore is currently in progress.');
    return this.createBackup(actorUserId, 'BACKUP');
  }

  async previewRestore(id: string): Promise<RestorePreviewDto> {
    if (this.restoring)
      throw new OperationError(409, 'A restore is already in progress.');
    const [source] = await this.db
      .select()
      .from(backupHistory)
      .where(eq(backupHistory.id, id))
      .limit(1);
    if (
      !source ||
      source.status !== 'SUCCEEDED' ||
      source.operation === 'RESTORE'
    )
      throw new OperationError(404, 'Restorable backup not found.');

    let manifest: BackupManifestDto;
    try {
      manifest = await this.readAndVerifyManifest(source.backupName);
    } catch (error) {
      if (error instanceof OperationError) throw error;
      throw new OperationError(
        409,
        'Backup files are unavailable or failed verification.',
        { cause: error },
      );
    }
    const currentSchemaVersion = await this.schemaVersion();
    if (
      !isManifestCompatible(
        manifest,
        this.config.applicationVersion,
        currentSchemaVersion,
      )
    )
      throw new OperationError(
        409,
        'The backup version is not compatible with this server.',
      );

    return {
      backupId: source.id,
      backupName: source.backupName,
      createdAt: manifest.createdAt,
      verifiedAt: new Date().toISOString(),
      applicationVersion: manifest.applicationVersion,
      schemaVersion: manifest.schemaVersion,
      databaseSizeBytes: manifest.database.sizeBytes,
      attachmentCount: manifest.attachments.length,
      rowCounts: manifest.rowCounts,
      currentRowCounts: await this.rowCounts(),
      safetyBackupWillBeCreated: true,
    };
  }

  async restore(id: string, confirmation: string, actorUserId: string) {
    if (this.restoring)
      throw new OperationError(409, 'A restore is already in progress.');
    const [source] = await this.db
      .select()
      .from(backupHistory)
      .where(eq(backupHistory.id, id))
      .limit(1);
    if (
      !source ||
      source.status !== 'SUCCEEDED' ||
      source.operation === 'RESTORE'
    )
      throw new OperationError(404, 'Restorable backup not found.');
    if (confirmation !== expectedRestoreConfirmation(source.backupName))
      throw new OperationError(
        409,
        'Restore confirmation does not match the selected backup.',
      );

    this.restoring = true;
    let safetyName: string | null = null;
    try {
      const manifest = await this.readAndVerifyManifest(source.backupName);
      const currentSchemaVersion = await this.schemaVersion();
      if (
        !isManifestCompatible(
          manifest,
          this.config.applicationVersion,
          currentSchemaVersion,
        )
      )
        throw new OperationError(
          409,
          'The backup version is not compatible with this server.',
        );

      safetyName = (await this.createBackup(actorUserId, 'SAFETY_BACKUP'))
        .backupName;
      const preservedHistory = await this.db.select().from(backupHistory);
      const sourceDirectory = this.backupPath(source.backupName);
      const stagedAttachments = join(
        this.backups,
        `.restore-${randomBytes(6).toString('hex')}`,
      );
      await cp(join(sourceDirectory, 'attachments'), stagedAttachments, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });

      await this.restoreDatabase(join(sourceDirectory, manifest.database.file));
      const rollbackAttachments = join(
        this.backups,
        `.attachments-${randomBytes(6).toString('hex')}`,
      );
      await rename(this.attachments, rollbackAttachments);
      try {
        await rename(stagedAttachments, this.attachments);
        await rm(rollbackAttachments, { recursive: true, force: true });
      } catch (error) {
        await rename(rollbackAttachments, this.attachments).catch(
          () => undefined,
        );
        throw error;
      }

      for (const row of preservedHistory)
        await this.db.insert(backupHistory).values(row).onConflictDoNothing();
      await this.verifyRestoredState(manifest);
      const [history] = await this.db
        .insert(backupHistory)
        .values({
          operation: 'RESTORE',
          status: 'SUCCEEDED',
          backupName: `restore-${Date.now()}`,
          sourceBackupName: source.backupName,
          manifest,
          message: `Restore verified. Safety backup: ${safetyName}.`,
          initiatedByUserId: actorUserId,
        })
        .returning();
      if (!history) throw new Error('Restore history was not recorded.');
      return this.toDto(history);
    } catch (error) {
      await this.recordFailure(
        'RESTORE',
        source.backupName,
        actorUserId,
        source.backupName,
      );
      if (error instanceof OperationError) throw error;
      throw new OperationError(
        503,
        `Restore failed. The safety backup was retained${safetyName ? ` as ${safetyName}` : ''}.`,
        { cause: error },
      );
    } finally {
      this.restoring = false;
    }
  }

  private async createBackup(
    actorUserId: string,
    operation: Exclude<Operation, 'RESTORE'>,
  ) {
    const stamp = new Date()
      .toISOString()
      .replaceAll(/[-:.]/g, '')
      .replace('000Z', 'Z');
    const backupName = assertBackupName(
      `bcis-${stamp}-${randomBytes(3).toString('hex')}`,
    );
    const directory = this.backupPath(backupName);
    try {
      await mkdir(join(directory, 'attachments'), { recursive: true });
      await mkdir(this.attachments, { recursive: true });
      const dumpPath = join(directory, 'database.dump');
      await this.dumpDatabase(dumpPath);
      await cp(this.attachments, join(directory, 'attachments'), {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      const manifest = await this.buildManifest(directory, dumpPath);
      await writeFile(
        join(directory, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      const [history] = await this.db
        .insert(backupHistory)
        .values({
          operation,
          status: 'SUCCEEDED',
          backupName,
          manifest,
          message: 'Database, attachments, manifest, and checksums verified.',
          initiatedByUserId: actorUserId,
        })
        .returning();
      if (!history) throw new Error('Backup history was not recorded.');
      if (operation === 'BACKUP') await this.enforceRetention();
      return this.toDto(history);
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(
        () => undefined,
      );
      await this.recordFailure(operation, backupName, actorUserId);
      if (error instanceof OperationError) throw error;
      throw new OperationError(
        503,
        'Backup could not be completed. Check server storage and PostgreSQL tools.',
        { cause: error },
      );
    }
  }

  private async buildManifest(
    directory: string,
    dumpPath: string,
  ): Promise<BackupManifestDto> {
    const attachmentRoot = join(directory, 'attachments');
    const attachmentFiles = await filesUnder(attachmentRoot);
    const dump = await stat(dumpPath);
    return {
      formatVersion: 1,
      applicationVersion: this.config.applicationVersion,
      schemaVersion: await this.schemaVersion(),
      createdAt: new Date().toISOString(),
      database: {
        file: 'database.dump',
        sizeBytes: dump.size,
        sha256: await sha256(dumpPath),
      },
      attachments: await Promise.all(
        attachmentFiles.map(async (path) => {
          const full = join(attachmentRoot, ...path.split('/'));
          return {
            path,
            sizeBytes: (await stat(full)).size,
            sha256: await sha256(full),
          };
        }),
      ),
      rowCounts: await this.rowCounts(),
    };
  }

  private async readAndVerifyManifest(backupName: string) {
    const directory = this.backupPath(backupName);
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')),
    );
    const dumpPath = join(directory, manifest.database.file);
    const dump = await stat(dumpPath);
    if (
      dump.size !== manifest.database.sizeBytes ||
      (await sha256(dumpPath)) !== manifest.database.sha256
    )
      throw new OperationError(
        409,
        'Backup database checksum validation failed.',
      );
    for (const item of manifest.attachments) {
      if (item.path.includes('..') || item.path.startsWith('/'))
        throw new OperationError(
          409,
          'Backup attachment path validation failed.',
        );
      const path = join(directory, 'attachments', ...item.path.split('/'));
      const file = await stat(path);
      if (file.size !== item.sizeBytes || (await sha256(path)) !== item.sha256)
        throw new OperationError(
          409,
          'Backup attachment checksum validation failed.',
        );
    }
    return manifest;
  }

  private async verifyRestoredState(manifest: BackupManifestDto) {
    if ((await this.schemaVersion()) !== manifest.schemaVersion)
      throw new Error('Restored schema version differs from the manifest.');
    const counts = await this.rowCounts();
    for (const [table, expected] of Object.entries(manifest.rowCounts))
      if (counts[table] !== expected)
        throw new Error(`Restored ${table} count differs from the manifest.`);
    for (const item of manifest.attachments) {
      const path = join(this.attachments, ...item.path.split('/'));
      if ((await sha256(path)) !== item.sha256)
        throw new Error(
          'Restored attachment checksum differs from the manifest.',
        );
    }
  }

  private async rowCounts() {
    const result = await this.db.execute<Record<string, number>>(sql`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from subscribers) as subscribers,
        (select count(*)::int from invoices) as invoices,
        (select count(*)::int from payments) as payments,
        (select count(*)::int from ledger_entries) as ledger_entries
    `);
    const row = result.rows[0];
    if (!row) throw new Error('Database counts are unavailable.');
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, Number(value)]),
    );
  }

  private async schemaVersion() {
    const result = await this.db.execute<{ id: number; hash: string }>(sql`
      select id, hash from drizzle.__drizzle_migrations order by id desc limit 1
    `);
    const row = result.rows[0];
    if (!row) throw new Error('Schema version is unavailable.');
    return `${row.id}:${row.hash}`;
  }

  private backupPath(name: string) {
    const path = resolve(this.backups, assertBackupName(name));
    if (!path.startsWith(`${this.backups}${sep}`))
      throw new Error('Invalid backup path.');
    return path;
  }

  private postgresArguments(file: string) {
    const url = new URL(this.config.databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol))
      throw new Error('Unsupported database URL.');
    return {
      common: [
        '--host',
        url.hostname,
        '--port',
        url.port || '5432',
        '--username',
        decodeURIComponent(url.username),
        '--dbname',
        decodeURIComponent(url.pathname.slice(1)),
      ],
      password: decodeURIComponent(url.password),
      file,
    };
  }

  private async dumpDatabase(file: string) {
    const connection = this.postgresArguments(file);
    await this.runTool(
      'pg_dump',
      [...connection.common, '--format=custom', '--no-owner', '--file', file],
      connection.password,
    );
  }

  private async restoreDatabase(file: string) {
    const connection = this.postgresArguments(file);
    await this.runTool(
      'pg_restore',
      [
        ...connection.common,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        file,
      ],
      connection.password,
    );
  }

  private runTool(
    name: 'pg_dump' | 'pg_restore',
    arguments_: string[],
    password?: string,
  ) {
    const executable = this.config.postgresBinDirectory
      ? join(this.config.postgresBinDirectory, toolName(name))
      : toolName(name);
    return new Promise<void>((resolvePromise, reject) => {
      const child = spawn(executable, arguments_, {
        shell: false,
        windowsHide: true,
        env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let error = '';
      child.stderr.on('data', (chunk) => {
        if (error.length < 4_000) error += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolvePromise()
          : reject(
              new Error(`${name} exited with code ${code}: ${error.trim()}`),
            ),
      );
    });
  }

  private async directoryWritable(directory: string) {
    try {
      await mkdir(directory, { recursive: true });
      await access(directory);
      const marker = join(
        directory,
        `.ready-${randomBytes(4).toString('hex')}`,
      );
      await writeFile(marker, 'ready', { flag: 'wx' });
      await unlink(marker);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureSettings() {
    await this.db
      .insert(applicationSettings)
      .values({ id: 1 })
      .onConflictDoNothing();
  }

  private async enforceRetention() {
    const settings = await this.settings();
    const successful = await this.db
      .select({ backupName: backupHistory.backupName })
      .from(backupHistory)
      .where(eq(backupHistory.operation, 'BACKUP'))
      .orderBy(desc(backupHistory.completedAt));
    for (const row of successful.slice(settings.backupRetentionCount))
      await rm(this.backupPath(row.backupName), {
        recursive: true,
        force: true,
      });
  }

  private async recordFailure(
    operation: Operation,
    backupName: string,
    actorUserId: string,
    sourceBackupName?: string,
  ) {
    await this.db
      .insert(backupHistory)
      .values({
        operation,
        status: 'FAILED',
        backupName:
          operation === 'RESTORE' ? `restore-failed-${Date.now()}` : backupName,
        sourceBackupName,
        message: `${operation === 'RESTORE' ? 'Restore' : 'Backup'} failed. See server logs for technical details.`,
        initiatedByUserId: actorUserId,
      })
      .onConflictDoNothing()
      .catch(() => undefined);
  }

  private async toDto(
    row: typeof backupHistory.$inferSelect,
  ): Promise<BackupHistoryDto> {
    const path = this.backupPath(
      row.backupName.startsWith('bcis-')
        ? row.backupName
        : (row.sourceBackupName ?? 'bcis-missing'),
    );
    return {
      id: row.id,
      operation: row.operation,
      status: row.status,
      backupName: row.backupName,
      sourceBackupName: row.sourceBackupName,
      message: row.message,
      completedAt: row.completedAt.toISOString(),
      available: await stat(path)
        .then(() => true)
        .catch(() => false),
      manifest: row.manifest ? manifestSchema.parse(row.manifest) : null,
    };
  }
}
