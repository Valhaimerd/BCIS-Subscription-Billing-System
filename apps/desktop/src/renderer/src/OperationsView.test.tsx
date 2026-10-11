import '@testing-library/jest-dom/vitest';

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value() {
    this.open = true;
  },
});
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value() {
    this.open = false;
  },
});

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type {
  ApplicationSettingsDto,
  BackupHistoryDto,
  OperationsReadinessDto,
  Paginated,
  RestorePreviewDto,
} from '@bcis/contracts';
import { OperationsView } from './OperationsView';

const readiness: OperationsReadinessDto = {
  databaseReady: true,
  attachmentStorageReady: true,
  backupStorageReady: true,
  postgresToolsReady: true,
  restoring: false,
};
const settings: ApplicationSettingsDto = {
  backupRetentionCount: 7,
  updatedAt: '2026-10-10T00:00:00.000Z',
};
const historyItem: BackupHistoryDto = {
  id: 'backup-1',
  operation: 'BACKUP',
  status: 'SUCCEEDED',
  backupName: 'bcis-2026-10-10',
  sourceBackupName: null,
  message: 'Verified',
  completedAt: '2026-10-10T00:00:00.000Z',
  available: true,
  manifest: null,
};
const history: Paginated<BackupHistoryDto> = {
  items: [historyItem],
  page: 1,
  pageSize: 10,
  total: 1,
};
const restorePreview: RestorePreviewDto = {
  backupId: historyItem.id,
  backupName: historyItem.backupName,
  createdAt: historyItem.completedAt,
  verifiedAt: '2026-10-10T12:02:00.000Z',
  applicationVersion: '0.1.0',
  schemaVersion: '8:current',
  databaseSizeBytes: 2048,
  attachmentCount: 3,
  rowCounts: {
    users: 2,
    subscribers: 20,
    invoices: 41,
    payments: 35,
    ledger_entries: 71,
  },
  currentRowCounts: {
    users: 3,
    subscribers: 24,
    invoices: 48,
    payments: 42,
    ledger_entries: 89,
  },
  safetyBackupWillBeCreated: true,
};
const restoreResult: BackupHistoryDto = {
  ...historyItem,
  id: 'restore-1',
  operation: 'RESTORE',
  backupName: 'restore-20261010',
  sourceBackupName: historyItem.backupName,
  message: 'Restore verified. Safety backup: bcis-safety-20261010.',
};

function attachOperations(overrides: Record<string, unknown> = {}) {
  const operations = {
    readiness: vi.fn(async () => readiness),
    settings: vi.fn(async () => settings),
    listBackups: vi.fn(async () => history),
    createBackup: vi.fn(async () => ({ backupName: historyItem.backupName })),
    updateSettings: vi.fn(async () => settings),
    previewRestore: vi.fn(async () => restorePreview),
    restoreBackup: vi.fn(async () => restoreResult),
    ...overrides,
  };
  window.bcis = {
    operations,
    receivables: {
      settings: vi.fn(async () => ({
        gracePeriodDays: 7,
        suspensionThresholdDays: 60,
        reconnectionFeeCentavos: 50000,
        updatedAt: '2026-10-10T00:00:00.000Z',
      })),
      updateSettings: vi.fn(),
    },
  } as unknown as NonNullable<typeof window.bcis>;
  return operations;
}

afterEach(() => {
  cleanup();
  delete window.bcis;
  vi.restoreAllMocks();
});

it('offers retry when readiness and backup history fail to load', async () => {
  const user = userEvent.setup();
  const operations = attachOperations({
    readiness: vi
      .fn()
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce(readiness),
  });
  render(<OperationsView canRestore={false} canManageSettings={false} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');
  await user.click(
    screen.getByRole('button', { name: 'Retry loading recovery status' }),
  );
  expect(
    await screen.findByRole('list', { name: 'Backup activity' }),
  ).toBeVisible();
  expect(operations.readiness).toHaveBeenCalledTimes(2);
});

it('announces backup progress and completion', async () => {
  const user = userEvent.setup();
  let completeBackup!: (value: { backupName: string }) => void;
  const operations = attachOperations({
    createBackup: vi.fn(
      () =>
        new Promise<{ backupName: string }>(
          (resolve) => (completeBackup = resolve),
        ),
    ),
  });
  render(<OperationsView canRestore canManageSettings />);

  await user.click(
    await screen.findByRole('button', { name: 'Create verified backup' }),
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Creating and verifying backup',
  );
  expect(
    screen.getByRole('button', { name: 'Creating backup…' }),
  ).toBeDisabled();

  completeBackup({ backupName: historyItem.backupName });
  expect(await screen.findByText(/was created and verified/)).toBeVisible();
  expect(operations.createBackup).toHaveBeenCalledOnce();
});

it('shows a retryable operation error without leaving backup disabled', async () => {
  const user = userEvent.setup();
  attachOperations({
    createBackup: vi
      .fn()
      .mockRejectedValueOnce(new Error('Backup storage is full.')),
  });
  render(<OperationsView canRestore canManageSettings />);

  const createButton = await screen.findByRole('button', {
    name: 'Create verified backup',
  });
  await user.click(createButton);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Backup storage is full.',
  );
  expect(createButton).toBeEnabled();
});

it('keeps the latest backup summary current while browsing older history pages', async () => {
  const user = userEvent.setup();
  const olderBackup: BackupHistoryDto = {
    ...historyItem,
    id: 'backup-older',
    backupName: 'bcis-2026-10-09',
    completedAt: '2026-10-09T00:00:00.000Z',
  };
  attachOperations({
    listBackups: vi.fn(async (page: number) =>
      page === 1
        ? { items: [historyItem], page: 1, pageSize: 1, total: 2 }
        : { items: [olderBackup], page: 2, pageSize: 1, total: 2 },
    ),
  });
  render(<OperationsView canRestore canManageSettings />);

  expect(
    await screen.findByRole('heading', {
      level: 3,
      name: historyItem.backupName,
    }),
  ).toBeVisible();
  await user.click(await screen.findByRole('button', { name: 'Next' }));

  expect(
    await screen.findByRole('heading', {
      level: 4,
      name: olderBackup.backupName,
    }),
  ).toBeVisible();
  expect(
    screen.getByRole('heading', {
      level: 3,
      name: historyItem.backupName,
    }),
  ).toBeVisible();
});

it('requires exact restore confirmation and keeps restore hidden for read-only users', async () => {
  const user = userEvent.setup();
  const operations = attachOperations();
  const { rerender } = render(
    <OperationsView canRestore={false} canManageSettings={false} />,
  );
  expect(
    await screen.findByRole('list', { name: 'Backup activity' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /Review restore/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Backup retention' }),
  ).not.toBeInTheDocument();

  rerender(<OperationsView canRestore canManageSettings />);
  await user.click(
    await screen.findByRole('button', { name: /Review restore/ }),
  );
  expect(await screen.findByRole('dialog')).toBeVisible();
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(operations.restoreBackup).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('verifies, explains impact, and links a successful restore to its history record', async () => {
  const user = userEvent.setup();
  const operations = attachOperations({
    listBackups: vi.fn(async () => ({
      items: [restoreResult, historyItem],
      page: 1,
      pageSize: 10,
      total: 2,
    })),
  });
  render(<OperationsView canRestore canManageSettings />);

  await user.click(
    await screen.findByRole('button', { name: /Review restore/ }),
  );
  const dialog = await screen.findByRole('dialog', { name: /Restore from/ });
  expect(operations.previewRestore).toHaveBeenCalledWith(historyItem.id);
  expect(await within(dialog).findByText('Backup verified')).toBeVisible();

  await user.click(
    within(dialog).getByRole('button', { name: 'Review impact' }),
  );
  expect(
    within(dialog).getByText(
      /Restoring replaces the current database and attachments/,
    ),
  ).toBeVisible();
  expect(within(dialog).getByText('20')).toBeVisible();
  expect(within(dialog).getByText('Current 24')).toBeVisible();
  await user.click(
    within(dialog).getByRole('button', { name: 'Continue to confirmation' }),
  );
  const confirmInput = within(dialog).getByLabelText(
    'Type RESTORE bcis-2026-10-10 to authorize this replacement.',
  );
  const restoreButton = within(dialog).getByRole('button', {
    name: 'Restore and replace current data',
  });
  expect(restoreButton).toBeDisabled();
  await user.type(confirmInput, 'RESTORE bcis-2026-10-10');
  expect(restoreButton).toBeEnabled();
  await user.click(restoreButton);

  const completedDialog = await screen.findByRole('dialog');
  expect(within(completedDialog).getByRole('status')).toHaveTextContent(
    'Restore completed and verified.',
  );
  await user.click(
    within(completedDialog).getByRole('button', {
      name: 'View restore result in history',
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'Backup register' }),
  ).toBeVisible();
  expect(await screen.findByText('restore-20261010')).toBeVisible();
  expect(operations.restoreBackup).toHaveBeenCalledWith(
    historyItem.id,
    'RESTORE bcis-2026-10-10',
  );
});

it('shows a retry path when backup verification fails', async () => {
  const user = userEvent.setup();
  attachOperations({
    previewRestore: vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'operations:backups:restore-preview': Error: Backup files are unavailable.",
        ),
      ),
  });
  render(<OperationsView canRestore canManageSettings />);

  await user.click(
    await screen.findByRole('button', { name: /Review restore/ }),
  );
  const dialog = await screen.findByRole('dialog', { name: /Restore from/ });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Backup files are unavailable.',
  );
  expect(await within(dialog).findByRole('alert')).not.toHaveTextContent(
    'Error invoking remote method',
  );
  expect(
    within(dialog).getByRole('button', { name: 'Retry verification' }),
  ).toBeEnabled();
  expect(
    within(dialog).queryByRole('button', {
      name: 'Restore and replace current data',
    }),
  ).not.toBeInTheDocument();
});
