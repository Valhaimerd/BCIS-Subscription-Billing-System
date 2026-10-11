import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OperationService } from './operations.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function fixture({
  databaseContents = 'synthetic-dump',
  sourceRows = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      operation: 'BACKUP',
      status: 'SUCCEEDED',
      backupName: 'bcis-fixture',
      sourceBackupName: null,
      manifest: null,
      message: 'Verified',
      completedAt: new Date('2026-10-10T12:00:00.000Z'),
      initiatedByUserId: '00000000-0000-4000-8000-000000000002',
    },
  ],
}: { databaseContents?: string; sourceRows?: unknown[] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'bcis-restore-preview-'));
  const backupDirectory = join(root, 'backups');
  const attachmentDirectory = join(root, 'attachments');
  const sourceDirectory = join(backupDirectory, 'bcis-fixture');
  const sourceAttachments = join(sourceDirectory, 'attachments');
  await mkdir(sourceAttachments, { recursive: true });
  const attachmentContents = 'synthetic-proof';
  await writeFile(join(sourceDirectory, 'database.dump'), databaseContents);
  await writeFile(join(sourceAttachments, 'proof.bin'), attachmentContents);
  const manifest = {
    formatVersion: 1,
    applicationVersion: '0.1.0',
    schemaVersion: '7:fixture-hash',
    createdAt: '2026-10-10T11:59:00.000Z',
    database: {
      file: 'database.dump',
      sizeBytes: Buffer.byteLength(databaseContents),
      sha256: sha256(databaseContents),
    },
    attachments: [
      {
        path: 'proof.bin',
        sizeBytes: Buffer.byteLength(attachmentContents),
        sha256: sha256(attachmentContents),
      },
    ],
    rowCounts: {
      users: 2,
      subscribers: 3,
      invoices: 4,
      payments: 5,
      ledger_entries: 6,
    },
  };
  await writeFile(
    join(sourceDirectory, 'manifest.json'),
    JSON.stringify(manifest),
  );

  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit: async () => sourceRows }) }),
  }));
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ id: 7, hash: 'fixture-hash' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          users: 4,
          subscribers: 8,
          invoices: 10,
          payments: 11,
          ledger_entries: 12,
        },
      ],
    });
  const service = new OperationService({ select, execute } as never, {
    databaseUrl: 'postgresql://test:test@localhost:5432/bcis_test',
    attachmentDirectory,
    backupDirectory,
    applicationVersion: '0.1.0',
  });
  return {
    root,
    backupDirectory,
    sourceDirectory,
    service,
    execute,
    manifest,
  };
}

describe('restore preflight', () => {
  let root = '';
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = '';
  });

  it('verifies backup files and returns snapshot impact without writing', async () => {
    const created = await fixture();
    root = created.root;
    const before = await readdir(created.backupDirectory);

    const preview = await created.service.previewRestore(
      '00000000-0000-4000-8000-000000000001',
    );

    expect(preview).toMatchObject({
      backupName: 'bcis-fixture',
      verifiedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      databaseSizeBytes: Buffer.byteLength('synthetic-dump'),
      attachmentCount: 1,
      rowCounts: created.manifest.rowCounts,
      currentRowCounts: {
        users: 4,
        subscribers: 8,
        invoices: 10,
        payments: 11,
        ledger_entries: 12,
      },
    });
    expect(await readdir(created.backupDirectory)).toEqual(before);
    expect(
      await readFile(join(created.sourceDirectory, 'database.dump')),
    ).toEqual(Buffer.from('synthetic-dump'));
    expect(created.execute).toHaveBeenCalledTimes(2);
  });

  it('rejects a changed dump before showing it as verified', async () => {
    const created = await fixture();
    root = created.root;
    await writeFile(join(created.sourceDirectory, 'database.dump'), 'changed');

    await expect(
      created.service.previewRestore('00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Backup database checksum validation failed.',
    });
  });

  it('rejects backups from another application or schema version', async () => {
    const created = await fixture();
    root = created.root;
    const manifest = { ...created.manifest, schemaVersion: '6:older-hash' };
    await writeFile(
      join(created.sourceDirectory, 'manifest.json'),
      JSON.stringify(manifest),
    );

    await expect(
      created.service.previewRestore('00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'The backup version is not compatible with this server.',
    });
  });

  it('does not offer missing or restore-result history as a source', async () => {
    const missing = await fixture({ sourceRows: [] });
    root = missing.root;
    await expect(
      missing.service.previewRestore('00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ statusCode: 404 });

    await rm(root, { recursive: true, force: true });
    const restored = await fixture({
      sourceRows: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          operation: 'RESTORE',
          status: 'SUCCEEDED',
          backupName: 'restore-1',
          sourceBackupName: 'bcis-fixture',
          manifest: null,
          message: 'Restored',
          completedAt: new Date('2026-10-10T12:00:00.000Z'),
          initiatedByUserId: '00000000-0000-4000-8000-000000000002',
        },
      ],
    });
    root = restored.root;
    await expect(
      restored.service.previewRestore('00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
